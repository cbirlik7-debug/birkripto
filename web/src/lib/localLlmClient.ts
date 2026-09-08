// Local LLM Client for BirKripto (Supports LM Studio, Ollama, and OpenAI-compatible local endpoints)

export interface LlmConfig {
  endpoint: string
  model: string
  temperature: number
  maxTokens: number
}

export interface LlmHealthStatus {
  isOnline: boolean
  latencyMs: number
  models: string[]
  activeModel?: string
  error?: string
}

export interface MarketMetrics {
  symbol: string
  currentPrice: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
  rsi: number
  ema9: number
  ema21: number
  trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS'
  supportLevel: number
  resistanceLevel: number
}

export interface AiTradeDecision {
  direction: 'LONG' | 'SHORT' | 'WAIT'
  confidence: number // 0-100
  entry_price: number
  stop_loss: number
  take_profit: number
  leverage: number // 1-20
  position_size_usd: number
  risk_reward_ratio: string
  reasoning: string
  risk_assessment: string
  raw_response?: string
}

const DEFAULT_ENDPOINT = 'http://localhost:1234/v1'

export function getStoredLlmConfig(): LlmConfig {
  const endpoint = localStorage.getItem('birkripto_llm_endpoint') || DEFAULT_ENDPOINT
  const model = localStorage.getItem('birkripto_llm_model') || ''
  const temperature = parseFloat(localStorage.getItem('birkripto_llm_temp') || '0.2')
  const maxTokens = parseInt(localStorage.getItem('birkripto_llm_tokens') || '800', 10)
  return { endpoint, model, temperature, maxTokens }
}

export function saveStoredLlmConfig(config: Partial<LlmConfig>) {
  if (config.endpoint !== undefined) localStorage.setItem('birkripto_llm_endpoint', config.endpoint)
  if (config.model !== undefined) localStorage.setItem('birkripto_llm_model', config.model)
  if (config.temperature !== undefined) localStorage.setItem('birkripto_llm_temp', config.temperature.toString())
  if (config.maxTokens !== undefined) localStorage.setItem('birkripto_llm_tokens', config.maxTokens.toString())
}

/**
 * Pings the local LLM endpoint to check online status and latency.
 */
export async function checkLlmHealth(endpoint = DEFAULT_ENDPOINT): Promise<LlmHealthStatus> {
  const startTime = performance.now()
  const cleanUrl = endpoint.replace(/\/+$/, '')

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3500)

    const res = await fetch(`${cleanUrl}/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const latencyMs = Math.round(performance.now() - startTime)

    if (!res.ok) {
      return {
        isOnline: false,
        latencyMs,
        models: [],
        error: `HTTP ${res.status}: ${res.statusText}`,
      }
    }

    const data = await res.json()
    const modelList: string[] = Array.isArray(data.data)
      ? data.data.map((m: { id?: string }) => m.id || '').filter(Boolean)
      : []

    return {
      isOnline: true,
      latencyMs,
      models: modelList,
      activeModel: modelList[0] || undefined,
    }
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - startTime)
    const message = err instanceof Error ? err.message : 'Bağlantı kurulamadı'
    return {
      isOnline: false,
      latencyMs,
      models: [],
      error: message,
    }
  }
}

/**
 * Calculates simple technical indicators from candles
 */
export function calculateIndicators(candles: Array<{ close: number; high: number; low: number; volume: number }>): {
  rsi: number
  ema9: number
  ema21: number
  trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS'
  supportLevel: number
  resistanceLevel: number
} {
  if (candles.length < 21) {
    const last = candles[candles.length - 1]?.close || 0
    return { rsi: 50, ema9: last, ema21: last, trend: 'SIDEWAYS', supportLevel: last * 0.98, resistanceLevel: last * 1.02 }
  }

  const closes = candles.map((c) => c.close)

  // Calculate EMA
  const calcEMA = (period: number): number => {
    const k = 2 / (period + 1)
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
    for (let i = period; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k)
    }
    return ema
  }

  const ema9 = calcEMA(9)
  const ema21 = calcEMA(21)

  // Calculate RSI (14 period)
  let gains = 0
  let losses = 0
  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gains += diff
    else losses += Math.abs(diff)
  }
  const avgGain = gains / 14
  const avgLoss = losses / 14 || 0.0001
  const rs = avgGain / avgLoss
  const rsi = Math.round(100 - 100 / (1 + rs))

  // Min / Max recent 20 candles for support / resistance
  const recentHighs = candles.slice(-20).map((c) => c.high)
  const recentLows = candles.slice(-20).map((c) => c.low)
  const resistanceLevel = Math.max(...recentHighs)
  const supportLevel = Math.min(...recentLows)

  let trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS' = 'SIDEWAYS'
  if (ema9 > ema21 * 1.002) trend = 'UPTREND'
  else if (ema9 < ema21 * 0.998) trend = 'DOWNTREND'

  return { rsi, ema9, ema21, trend, supportLevel, resistanceLevel }
}

/**
 * Sends prompt to local LLM and returns structured trade decision
 */
export async function analyzeMarketWithLlm(
  metrics: MarketMetrics,
  recentCandles: Array<{ openTime: number; close: number; high: number; low: number; volume: number }>,
  configOverride?: Partial<LlmConfig>
): Promise<AiTradeDecision> {
  const config = { ...getStoredLlmConfig(), ...configOverride }
  const cleanUrl = config.endpoint.replace(/\/+$/, '')

  const systemPrompt = `Sen disiplinli, profesyonel bir Kripto Para Baş Analisti ve Risk Yöneticisisin (AI Pilot).
Görevin: Canlı piyasa verilerini, teknik indikatörleri ve mum hareketlerini analiz ederek KESİNLİKLE JSON formatında bir ticaret kararı (LONG, SHORT veya WAIT) üretmektir.

KURALLAR:
1. Yalnızca geçerli bir JSON nesnesi döndür. JSON bloğu dışında hiçbir selamlama, önsöz veya kapanış metni ekleme!
2. Risk yönetimi katıdır: Risk/Ödül oranı en az 1:1.5 olmalıdır.
3. Stop Loss (SL) seviyesi, giriş fiyatına LONG için %0.8 - %3.0 altında, SHORT için %0.8 - %3.0 üstünde olmalıdır.
4. Take Profit (TP) seviyesi, mantıklı bir direnç/destek veya risk-ödül oranına göre belirlenmelidir.
5. Belirsizlik varsa tereddütsüz "WAIT" kararı ver.
6. JSON ŞEMASI:
{
  "direction": "LONG" | "SHORT" | "WAIT",
  "confidence": 0-100 arasında tamsayı,
  "entry_price": float (mevcut fiyata çok yakın),
  "stop_loss": float,
  "take_profit": float,
  "leverage": 1-10 arasında tamsayı,
  "position_size_usd": float (tavsiye edilen marjin örn: 500.0),
  "risk_reward_ratio": "1:2.0" gibi metin,
  "reasoning": "Türkçe teknik analiz gerekçesi (RSI, EMA kesişimi, hacim ve trend açıklaması)",
  "risk_assessment": "Türkçe risk uyarısı (örn: Direnç kırılımı beklenmeli veya ani volatilite riski)"
}`

  const userPrompt = `Aşağıdaki canlı piyasa metriklerini incele:
- Sembol: ${metrics.symbol}
- Canlı Fiyat: $${metrics.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- 24s Değişim: %${metrics.change24h.toFixed(2)}
- 24s En Yüksek: $${metrics.high24h} | En Düşük: $${metrics.low24h}
- RSI (14): ${metrics.rsi} ${metrics.rsi > 70 ? '(Aşırı Alım)' : metrics.rsi < 30 ? '(Aşırı Satım)' : '(Nötr)'}
- EMA 9: $${metrics.ema9.toFixed(2)} | EMA 21: $${metrics.ema21.toFixed(2)}
- Genel Trend: ${metrics.trend}
- Yakın Destek: $${metrics.supportLevel.toFixed(2)} | Yakın Direnç: $${metrics.resistanceLevel.toFixed(2)}

Son 5 Mum Kapanışı:
${recentCandles
  .slice(-5)
  .map(
    (c, i) =>
      `  [Mum ${i + 1}] Kapanış: $${c.close} | Yüksek: $${c.high} | Düşük: $${c.low} | Hacim: ${Math.round(c.volume)}`
  )
  .join('\n')}

Lütfen yukarıdaki şablona harfiyen uygun bir JSON yanıtı döndür.`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000) // 60s for local LLM generation

  try {
    const payload: Record<string, unknown> = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }

    if (config.model) {
      payload.model = config.model
    }

    const res = await fetch(`${cleanUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`Yerel LLM Hatası (${res.status}): ${errBody || res.statusText}`)
    }

    const json = await res.json()
    const rawContent: string = json.choices?.[0]?.message?.content || ''

    // Parse JSON safely from markdown or text
    return parseAiTradeResponse(rawContent, metrics)
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    const msg = err instanceof Error ? err.message : 'Bilinmeyen model hatası'
    throw new Error(msg)
  }
}

/**
 * Extracts and parses JSON from raw LLM output
 */
function parseAiTradeResponse(raw: string, metrics: MarketMetrics): AiTradeDecision {
  let cleaned = raw.trim()

  // Remove markdown code blocks if present
  if (cleaned.includes('```')) {
    const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (match && match[1]) {
      cleaned = match[1].trim()
    }
  }

  // Find first { and last }
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1)
  }

  try {
    const parsed = JSON.parse(cleaned)

    const direction: 'LONG' | 'SHORT' | 'WAIT' =
      parsed.direction === 'LONG' || parsed.direction === 'SHORT' ? parsed.direction : 'WAIT'
    const confidence = Math.min(100, Math.max(0, Math.round(Number(parsed.confidence) || 50)))
    const entry_price = Number(parsed.entry_price) || metrics.currentPrice
    const leverage = Math.min(20, Math.max(1, Math.round(Number(parsed.leverage) || 3)))
    const position_size_usd = Number(parsed.position_size_usd) || 500

    let stop_loss = Number(parsed.stop_loss)
    let take_profit = Number(parsed.take_profit)

    // Fallback safe calculations if LLM returned invalid numbers
    if (!stop_loss || isNaN(stop_loss)) {
      stop_loss = direction === 'LONG' ? entry_price * 0.985 : entry_price * 1.015
    }
    if (!take_profit || isNaN(take_profit)) {
      take_profit = direction === 'LONG' ? entry_price * 1.03 : entry_price * 0.97
    }

    return {
      direction,
      confidence,
      entry_price,
      stop_loss,
      take_profit,
      leverage,
      position_size_usd,
      risk_reward_ratio: parsed.risk_reward_ratio || '1:2.0',
      reasoning: parsed.reasoning || 'Yerel LLM indikatörleri analiz etti ve sinyali üretti.',
      risk_assessment: parsed.risk_assessment || 'Standart piyasa volatilitesi dikkate alınmalıdır.',
      raw_response: raw,
    }
  } catch {
    // If JSON parsing fails, construct a safe fallback from text
    const isLong = /long|alım|bullish/i.test(raw)
    const isShort = /short|satım|bearish/i.test(raw)
    const direction = isLong ? 'LONG' : isShort ? 'SHORT' : 'WAIT'

    return {
      direction,
      confidence: 60,
      entry_price: metrics.currentPrice,
      stop_loss: direction === 'LONG' ? metrics.currentPrice * 0.985 : metrics.currentPrice * 1.015,
      take_profit: direction === 'LONG' ? metrics.currentPrice * 1.03 : metrics.currentPrice * 0.97,
      leverage: 3,
      position_size_usd: 500,
      risk_reward_ratio: '1:2.0',
      reasoning: raw.slice(0, 300) || 'Model analiz metni üretti.',
      risk_assessment: 'JSON dışı yanıt ayrıştırıldı, parametreler güvenli sınırlarda belirlendi.',
      raw_response: raw,
    }
  }
}
