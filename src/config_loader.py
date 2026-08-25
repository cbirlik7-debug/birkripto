"""Global ve strateji yapılandırma yükleyici.

- `global.yaml` (borsa, DB, fee, execution, LLM)
- `config/strategies/*.yaml` (aktif strateji dosyaları)
- `.env` (API anahtarları — opsiyonel)

Kullanım:
    cfg = load_global_config()                 # dict
    strat = load_strategy_config("btc_conservative_v1")
    strategies = load_strategies(status="active")   # tüm status: active
"""
from pathlib import Path
from typing import Dict, List, Optional

import yaml
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"
STRATEGIES_DIR = CONFIG_DIR / "strategies"
PROPOSED_DIR = CONFIG_DIR / "proposed_strategies"

# .env varsa yükle (yoksa sessizce geç)
load_dotenv(CONFIG_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")


def _safe_yaml(path: Path) -> Optional[dict]:
    """Bir YAML dosyasını dict olarak yükler; hata/eksik durumda None döner."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, yaml.YAMLError) as exc:
        print(f"YAML yüklenemedi: {path} -> {exc}")
        return None


def load_global_config() -> dict:
    """global.yaml içeriğini döndürür."""
    return _safe_yaml(CONFIG_DIR / "global.yaml") or {}


def load_strategy_config(strategy_id: str) -> Optional[dict]:
    """strategy_id'ye göre config/strategies/*.yaml dosyasını bulup yükler."""
    for yaml_file in STRATEGIES_DIR.glob("*.yaml"):
        data = _safe_yaml(yaml_file)
        if data and data.get("strategy_id") == strategy_id:
            data["_config_path"] = str(yaml_file)
            return data
    return None


def load_strategies(status: str = "active") -> List[dict]:
    """Belirli durumdaki tüm strateji config'lerini döndürür."""
    result = []
    for yaml_file in sorted(STRATEGIES_DIR.glob("*.yaml")):
        data = _safe_yaml(yaml_file)
        if data and data.get("status", "active") == status:
            data["_config_path"] = str(yaml_file)
            result.append(data)
    return result


def load_proposed_proposals() -> List[dict]:
    """proposed_strategies klasöründeki tüm taslakları döndürür."""
    result = []
    for yaml_file in sorted(PROPOSED_DIR.glob("*.yaml")):
        data = _safe_yaml(yaml_file)
        if data:
            data["_config_path"] = str(yaml_file)
            result.append(data)
    return result