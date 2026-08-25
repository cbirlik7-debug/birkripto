"""LLM Strateji Danışmanı (Bölüm 9.4) — offline, canlı işleme müdahale etmez.

Çalıştırma: `python -m src.analysis.strategy_advisor --symbol BTCUSDT`

Görev:
1. Geçmiş işlem özetini topla (trade_history_report)
2. Güncel piyasa özetini topla (market_snapshot)
3. LLM'e (Ollama varsayılan) yeni bir strateji config taslağı öner
4. Çıktıyı SADECE `config/proposed_strategies/` klasörüne yaz (`status: proposed`)

Kesin kural: Bu modül hiçbir zaman aktif strateji dosyasını değiştirmez,
çalışan bir bot'u durdurmaz ya da canlı işlemi kapatmaz. Taslak, kullanıcı
tarafından onaylanıp `strategies/` klasörüne taşınmadıkça aktif edilmez.
"""
import argparse
import datetime as dt
import json
import logging
import sys
import urllib.request
from pathlib import Path

import yaml

from ..config_loader import PROPOSED_DIR
from .market_snapshot import MarketSnapshot
from .trade_history_report import TradeHistoryReport

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("strategy_advisor")

SYSTEM_PROMPT = """Sen deneyimli bir kripto trading strateji danışmanısın.
Sana verilen piyasa özeti ve işlem geçmişine dayanarak YALNIZCA aşağıdaki
YAML şablonunu doldurup çıktı olarak ver. Ek açıklama yapma; çıktı geçerli
YAML olmalıdır.

Şablon:
strategy_id: <benzersiz_kimlik_v2>
name: "<İsim>"
description: "> <strategy neden önerildiğine dair gerekçe>"
symbol: <SEMBOL>
timeframe: "5m"
risk_level: <low|medium|high>
indicators:
  ema: {enabled: true, short_period: 9, long_period: 21, weight: 0.35}
  rsi: {enabled: true, period: 14, oversold: 30, overbought: 70, weight: 0.30}
  volume_profile: {enabled: true, lookback_periods: 100, weight: 0.25}
  atr: {enabled: true, period: 14, min_volatility_mult: 0.0005, weight: 0.10}
entry:
  min_confidence_threshold: 70
created_by: llm_advisor
created_at: <BUGUN>
status: proposed
"""


class StrategyAdvisor:
    """LLM'den strateji önerisi üretir ve proposed_strategies/'e yazar."""

    def __init__(self, provider: str = "ollama", model: str = "llama3.1:8b-instruct-q4",
                 ollama_base_url: str = "http://localhost:11434"):
        self.provider = provider
        self.model = model
        self.ollama_base_url = ollama_base_url
        self.market = MarketSnapshot()
        self.history = TradeHistoryReport()

    def _ask_ollama(self, prompt: str) -> str:
        url = f"{self.ollama_base_url}/api/generate"
        payload = json.dumps({"model": self.model, "prompt": prompt,
                              "stream": False, "system": SYSTEM_PROMPT}).encode()
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
        return data.get("response", "")

    def generate(self, symbol: str) -> str:
        """Piyasa + tarih özetini toplar, LLM'den taslak YAML alır."""
        market_txt = self.market.to_text(symbol)
        history_txt = self.history.to_text()
        prompt = (f"Piyasa özeti:\n{market_txt}\n\n"
                  f"İşlem geçmişi:\n{history_txt}\n\n"
                  f"Bu bilgilere göre {symbol} için yeni bir strateji YAML'ı üret.")
        try:
            raw = self._ask_ollama(prompt)
        except Exception as exc:
            logger.error("LLM çağrısı başarısız: %s", exc)
            raise
        return raw.strip()

    def save_proposal(self, symbol: str, yaml_text: str) -> Path:
        """Taslağı proposed_strategies/'e yazar; strateji_id'yi birlikte döner."""
        PROPOSED_DIR.mkdir(parents=True, exist_ok=True)
        try:
            data = yaml.safe_load(yaml_text)
            if not isinstance(data, dict):
                raise ValueError("YAML geçerli bir sözlük değil")
        except yaml.YAMLError as exc:
            logger.error("LLM çıktısı geçersiz YAML: %s", exc)
            raise

        strategy_id = data.get("strategy_id") or f"{symbol.lower()}_llm_v1"
        if "created_at" not in data:
            data["created_at"] = dt.date.today().isoformat()
        data["status"] = "proposed"
        data["created_by"] = "llm_advisor"

        safe_id = strategy_id.replace("/", "_")
        out_path = PROPOSED_DIR / f"{safe_id}.yaml"
        with open(out_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
        logger.info("Taslak kaydedildi: %s", out_path)
        logger.info("Not: Bu taslak 'proposed' durumunda. Aktifleştirmek için "
                    "config/strategies/ klasörüne taşıyıp 'status: active' yapın.")
        return out_path


def main():
    parser = argparse.ArgumentParser(description="LLM Strateji Danışmanı (offline)")
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--model", default=None)
    args = parser.parse_args()

    advisor = StrategyAdvisor(model=args.model or "llama3.1:8b-instruct-q4")
    proposal = advisor.generate(args.symbol)
    advisor.save_proposal(args.symbol, proposal)


if __name__ == "__main__":
    main()