import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Sparkles,
  RefreshCw,
  Sliders,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  Pause,
  Zap,
  Target,
  Clock,
  Activity,
  Layers,
  HelpCircle,
} from 'lucide-react'
import {
  checkLlmHealth,
  analyzeMarketWithLlm,
  calculateIndicators,
  getStoredLlmConfig,
  saveStoredLlmConfig,
  LlmHealthStatus,
  AiTradeDecision,
  MarketMetrics,
} from '../lib/localLlmClient'
import { supabase, BotConfig, Position, StrategyAccount, AiPilotLog } from '../lib/supabaseClient'

interface TickerData {
  symbol: string
  lastPrice: number
  priceChangePercent: number
  highPrice: number
  lowPrice: number
  volume: number
}

const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'AVAXUSDT']
const TIMEFRAMES = ['15m', '1h', '4h']

export default function AiPilot() {
  // LLM Status & Settings
  const [llmStatus, setLlmStatus] = useState<LlmHealthStatus>({
    isOnline: false,
    latencyMs: 0,
    models: [],
  })
  const [checkingHealth, setCheckingHealth] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [endpointInput, setEndpointInput] = useState(getStoredLlmConfig().endpoint)
  const [selectedModel, setSelectedModel] = useState(getStoredLlmConfig().model)

  // Market & Asset Selection
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT')
  const [selectedTimeframe, setSelectedTimeframe] = useState('15m')
  const [ticker, setTicker] = useState<TickerData | null>(null)
  const [metrics, setMetrics] = useState<MarketMetrics | null>(null)
  const [candles, setCandles] = useState<Array<{ openTime: number; close: number; high: number; low: number; volume: number }>>([])

  // Bot Configs & Account
  const [configs, setConfigs] = useState<BotConfig[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const [account, setAccount] = useState<StrategyAccount | null>(null)
  const [openPositions, setOpenPositions] = useState<Position[]>([])

  // AI Decision State
  const [analyzing, setAnalyzing] = useState(false)
  const [aiDecision, setAiDecision] = useState<AiTradeDecision | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [executingTrade, setExecutingTrade] = useState(false)
  const [tradeSuccessMsg, setTradeSuccessMsg] = useState<string | null>(null)

  // Autonomous Pilot State
  const [autoPilotActive, setAutoPilotActive] = useState(false)
  const [autoPilotMinConfidence, setAutoPilotMinConfidence] = useState(75)
  const [autoPilotIntervalMinutes, setAutoPilotIntervalMinutes] = useState(5)
  const autoPilotTimerRef = useRef<number | null>(null)

  // AI Pilot Logs
  const [pilotLogs, setPilotLogs] = useState<AiPilotLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  // 1. Check LLM Health
  const checkHealth = useCallback(async () => {
    setCheckingHealth(true)
    try {
      const status = await checkLlmHealth(endpointInput)
      setLlmStatus(status)
      if (status.models.length > 0 && !selectedModel) {
        setSelectedModel(status.models[0])
        saveStoredLlmConfig({ model: status.models[0] })
      }
    } finally {
      setCheckingHealth(false)
    }
  }, [endpointInput, selectedModel])

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 12000) // Ping every 12s
    return () => clearInterval(interval)
  }, [checkHealth])

  // 2. Load configs and positions
  useEffect(() => {
    loadDatabaseData()

    const channel = supabase
      .channel('ai-pilot-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, loadDatabaseData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'strategy_accounts' }, loadDatabaseData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_pilot_logs' }, loadLogs)
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  async function loadDatabaseData() {
    try {
      const [{ data: cfgs }, { data: pos }] = await Promise.all([
        supabase.from('bot_config').select('*'),
        supabase.from('positions').select('*').eq('status', 'open'),
      ])

      if (cfgs && cfgs.length > 0) {
        setConfigs(cfgs)
        if (!selectedConfigId) {
          const match = cfgs.find((c) => c.symbol === selectedSymbol) || cfgs[0]
          setSelectedConfigId(match.id)
        }
      }
      setOpenPositions(pos ?? [])
      loadLogs()
    } catch (err) {
      console.error('Veri yükleme hatası:', err)
    }
  }

  // Load Strategy Account when config changes
  useEffect(() => {
    if (!selectedConfigId) return
    supabase
      .from('strategy_accounts')
      .select('*')
      .eq('config_id', selectedConfigId)
      .maybeSingle()
      .then(({ data }) => setAccount(data))
  }, [selectedConfigId])

  async function loadLogs() {
    setLoadingLogs(true)
    try {
      const { data } = await supabase
        .from('ai_pilot_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      setPilotLogs(data ?? [])
    } finally {
      setLoadingLogs(false)
    }
  }

  // 3. Fetch Binance Market Data & Indicators
  const fetchMarketData = useCallback(async () => {
    try {
      // 24hr Ticker
      const tickerRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${selectedSymbol}`)
      if (tickerRes.ok) {
        const rawTicker = await tickerRes.json()
        setTicker({
          symbol: rawTicker.symbol,
          lastPrice: parseFloat(rawTicker.lastPrice),
          priceChangePercent: parseFloat(rawTicker.priceChangePercent),
          highPrice: parseFloat(rawTicker.highPrice),
          lowPrice: parseFloat(rawTicker.lowPrice),
          volume: parseFloat(rawTicker.volume),
        })
      }

      // Klines for indicators
      const klinesRes = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${selectedSymbol}&interval=${selectedTimeframe}&limit=100`
      )
      if (klinesRes.ok) {
        const rawKlines: unknown[][] = await klinesRes.json()
        const parsedCandles = rawKlines.map((k) => ({
          openTime: Number(k[0]),
          close: parseFloat(String(k[4])),
          high: parseFloat(String(k[2])),
          low: parseFloat(String(k[3])),
          volume: parseFloat(String(k[5])),
        }))
        setCandles(parsedCandles)

        const calculated = calculateIndicators(parsedCandles)
        const lastPrice = parsedCandles[parsedCandles.length - 1]?.close || 0

        setMetrics({
          symbol: selectedSymbol,
          currentPrice: lastPrice,
          change24h: ticker?.priceChangePercent || 0,
          high24h: ticker?.highPrice || calculated.resistanceLevel,
          low24h: ticker?.lowPrice || calculated.supportLevel,
          volume24h: ticker?.volume || 0,
          ...calculated,
        })
      }
    } catch (err) {
      console.error('Piyasa verisi alınamadı:', err)
    }
  }, [selectedSymbol, selectedTimeframe, ticker?.priceChangePercent, ticker?.highPrice, ticker?.lowPrice, ticker?.volume])

  useEffect(() => {
    fetchMarketData()
    const timer = setInterval(fetchMarketData, 10000) // Poll ticker every 10s
    return () => clearInterval(timer)
  }, [fetchMarketData])

  // Sync selectedConfigId when symbol changes
  useEffect(() => {
    const matched = configs.find((c) => c.symbol === selectedSymbol)
    if (matched) setSelectedConfigId(matched.id)
  }, [selectedSymbol, configs])

  // 4. Run AI Analysis
  async function runAiAnalysis(isAutonomous = false) {
    if (!llmStatus.isOnline) {
      setDecisionError('Yerel LLM çevrimdışı. Lütfen LM Studio sunucusunu başlatın.')
      return null
    }
    if (!metrics || candles.length === 0) {
      setDecisionError('Piyasa metrikleri henüz yüklenmedi.')
      return null
    }

    setAnalyzing(true)
    setDecisionError(null)
    setTradeSuccessMsg(null)

    try {
      const decision = await analyzeMarketWithLlm(metrics, candles, {
        endpoint: endpointInput,
        model: selectedModel,
      })

      setAiDecision(decision)

      // Log the analysis in Supabase
      if (selectedConfigId) {
        await supabase.rpc('log_ai_pilot_action', {
          p_config_id: selectedConfigId,
          p_symbol: selectedSymbol,
          p_action: 'ANALYSIS',
          p_model_used: selectedModel || 'local-llm',
          p_prompt_summary: `${selectedSymbol} ${selectedTimeframe} analizi -> Karar: ${decision.direction} (Güven: %${decision.confidence})`,
          p_decision: decision,
          p_status: 'INFO',
        })
      }

      // If autonomous and confident, execute immediately
      if (isAutonomous && autoPilotActive && decision.direction !== 'WAIT') {
        if (decision.confidence >= autoPilotMinConfidence) {
          const currentPos = openPositions.find((p) => p.symbol === selectedSymbol)
          if (!currentPos) {
            await handleExecuteTrade(decision)
          }
        }
      }

      return decision
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analiz sırasında hata oluştu'
      setDecisionError(msg)
      return null
    } finally {
      setAnalyzing(false)
    }
  }

  // 5. Execute Trade via Supabase
  async function handleExecuteTrade(decisionToExecute?: AiTradeDecision) {
    const decision = decisionToExecute || aiDecision
    if (!decision || decision.direction === 'WAIT') return
    if (!selectedConfigId) {
      setDecisionError('İlişkili bir bot konfigürasyonu seçilmelidir.')
      return
    }

    // Check if position already open for this config
    const activeForConfig = openPositions.find((p) => p.config_id === selectedConfigId)
    if (activeForConfig) {
      setDecisionError(`Bu strateji (${selectedSymbol}) için zaten açık bir pozisyon bulunuyor.`)
      return
    }

    setExecutingTrade(true)
    setDecisionError(null)

    try {
      const sizeUnits = parseFloat((decision.position_size_usd / decision.entry_price).toFixed(5))

      const { data, error } = await supabase.rpc('execute_ai_pilot_order', {
        p_config_id: selectedConfigId,
        p_symbol: selectedSymbol,
        p_direction: decision.direction.toLowerCase(),
        p_entry_price: decision.entry_price,
        p_size: sizeUnits,
        p_stop_loss: decision.stop_loss,
        p_take_profit: decision.take_profit,
        p_leverage: decision.leverage,
        p_model_used: selectedModel || 'local-llm',
        p_decision: decision,
      })

      if (error) throw error

      setTradeSuccessMsg(
        `AI Pozisyonu Başarıyla Açıldı! Yön: ${decision.direction}, Fiyat: $${decision.entry_price}, Kaldıraç: ${decision.leverage}x`
      )
      loadDatabaseData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'İşlem yürütülemedi'
      setDecisionError(msg)
    } finally {
      setExecutingTrade(false)
    }
  }

  // 6. Close Position Manually
  async function handleClosePosition(positionId: string, currentPrice: number) {
    try {
      const { error } = await supabase.rpc('close_manual_position', {
        p_position_id: positionId,
        p_exit_price: currentPrice,
      })
      if (error) throw error
      loadDatabaseData()
    } catch (err: unknown) {
      alert('Pozisyon kapatılamadı: ' + (err instanceof Error ? err.message : 'Hata'))
    }
  }

  // 7. Auto Pilot Loop
  useEffect(() => {
    if (autoPilotActive) {
      const intervalMs = autoPilotIntervalMinutes * 60 * 1000
      runAiAnalysis(true)
      autoPilotTimerRef.current = window.setInterval(() => {
        runAiAnalysis(true)
      }, intervalMs)
    } else {
      if (autoPilotTimerRef.current) {
        clearInterval(autoPilotTimerRef.current)
        autoPilotTimerRef.current = null
      }
    }
    return () => {
      if (autoPilotTimerRef.current) clearInterval(autoPilotTimerRef.current)
    }
  }, [autoPilotActive, autoPilotIntervalMinutes, selectedSymbol, selectedTimeframe])

  // Save Settings
  function handleSaveSettings() {
    saveStoredLlmConfig({
      endpoint: endpointInput,
      model: selectedModel,
    })
    setShowSettingsModal(false)
    checkHealth()
  }

  const currentActivePosition = openPositions.find((p) => p.symbol === selectedSymbol)

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Page Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(56, 189, 248, 0.2))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(139, 92, 246, 0.4)',
              }}
            >
              <Sparkles size={24} style={{ color: '#c084fc' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.85rem', fontWeight: 800, margin: 0 }} className="ai-gradient-title">
                Aİ Pilot
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                Yerel LLM ile Pazar Analizi, Otomatik Sinyal Üretimi ve Ticaret Yönetimi
              </p>
            </div>
          </div>
        </div>

        {/* AI Health Status & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Online/Offline Badge */}
          <div
            className={`ai-status-pill ${llmStatus.isOnline ? 'online' : 'offline'}`}
            title={llmStatus.isOnline ? `Model: ${selectedModel || 'Varsayılan'} | ${llmStatus.latencyMs}ms` : llmStatus.error}
          >
            <div className={llmStatus.isOnline ? 'live-dot' : 'live-dot-red'} />
            <span>{llmStatus.isOnline ? 'AI ONLINE' : 'AI OFFLINE'}</span>
            {llmStatus.isOnline && (
              <span style={{ opacity: 0.75, fontSize: '0.72rem', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: 6 }}>
                {llmStatus.latencyMs}ms
              </span>
            )}
          </div>

          {/* Model Display Badge */}
          {llmStatus.isOnline && (
            <div
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: '6px 12px',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Layers size={14} style={{ color: 'var(--accent-purple)' }} />
              <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedModel || 'Otomatik Model'}
              </span>
            </div>
          )}

          {/* Refresh Ping Button */}
          <button
            onClick={checkHealth}
            disabled={checkingHealth}
            title="Bağlantıyı Yeniden Yokla"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 12px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.8rem',
            }}
          >
            <RefreshCw size={15} className={checkingHealth ? 'loading-spinner' : ''} />
            <span>Yenile</span>
          </button>

          {/* Settings Modal Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 12px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.8rem',
            }}
          >
            <Sliders size={15} />
            <span>LLM Ayarları</span>
          </button>
        </div>
      </div>

      {/* Offline Banner / Alert */}
      {!llmStatus.isOnline && (
        <div
          style={{
            background: 'rgba(244, 63, 94, 0.08)',
            border: '1px solid rgba(244, 63, 94, 0.25)',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <AlertTriangle size={24} style={{ color: '#f43f5e', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#f43f5e', fontSize: '0.95rem', marginBottom: 4 }}>
              Yerel LLM Sunucusu Çevrimdışı (AI OFFLINE)
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
              AI Pilot'ın canlı analiz yapabilmesi için bu bilgisayardaki <strong>LM Studio</strong> veya{' '}
              <strong>Ollama</strong> yerel sunucusunun açık olması gerekir.
            </p>
            <div
              style={{
                marginTop: 10,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                fontSize: '0.8rem',
                color: 'var(--text-primary)',
              }}
            >
              <div
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <strong>LM Studio:</strong> Sol alt <code>&lt;-&gt; Local Server</code> sekmesinden <code>Start Server</code>{' '}
                (Port: 1234)
              </div>
              <div
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <strong>Terminal Komutu:</strong> <code>~/.lmstudio/bin/lms server start</code>
              </div>
            </div>
          </div>
          <button
            onClick={checkHealth}
            style={{
              background: '#f43f5e',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 14px',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              alignSelf: 'center',
            }}
          >
            Yeniden Dene
          </button>
        </div>
      )}

      {/* Asset Bar & Control Ribbon */}
      <div
        className="card"
        style={{
          marginBottom: 20,
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        {/* Symbol Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Sembol:
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {SUPPORTED_SYMBOLS.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSymbol(s)}
                style={{
                  background: selectedSymbol === s ? 'var(--accent-blue-glow)' : 'rgba(255,255,255,0.03)',
                  border: selectedSymbol === s ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                  color: selectedSymbol === s ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {s.replace('USDT', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Timeframe Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Zaman:
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf)}
                style={{
                  background: selectedTimeframe === tf ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                  border: selectedTimeframe === tf ? '1px solid var(--accent-purple)' : '1px solid var(--border)',
                  color: selectedTimeframe === tf ? 'var(--accent-purple)' : 'var(--text-secondary)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Autonomous Pilot Switch */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: autoPilotActive ? 'rgba(16, 217, 160, 0.1)' : 'rgba(255,255,255,0.03)',
            border: autoPilotActive ? '1px solid rgba(16, 217, 160, 0.3)' : '1px solid var(--border)',
            padding: '6px 14px',
            borderRadius: 8,
            transition: 'all 0.3s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {autoPilotActive ? (
              <Play size={16} style={{ color: '#10d9a0' }} />
            ) : (
              <Pause size={16} style={{ color: 'var(--text-muted)' }} />
            )}
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: autoPilotActive ? '#10d9a0' : 'var(--text-primary)' }}>
                Otonom Pilot: {autoPilotActive ? 'AÇIK' : 'KAPALI'}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                {autoPilotActive ? `Her ${autoPilotIntervalMinutes}dk'da bir tarar (≥%${autoPilotMinConfidence})` : 'Manuel tetikleme'}
              </div>
            </div>
          </div>
          <button
            onClick={() => setAutoPilotActive(!autoPilotActive)}
            style={{
              background: autoPilotActive ? '#10d9a0' : 'var(--bg-secondary)',
              color: autoPilotActive ? '#000' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {autoPilotActive ? 'Durdur' : 'Başlat'}
          </button>
        </div>
      </div>

      {/* Main Grid: Left Side Market & Indicators, Right Side AI Decision */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr', gap: 20, marginBottom: 24 }}>
        {/* Left Column: Live Market Metrics & Account Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Ticker Card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>{selectedSymbol}</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background:
                      (ticker?.priceChangePercent || 0) >= 0 ? 'rgba(16, 217, 160, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                    color: (ticker?.priceChangePercent || 0) >= 0 ? '#10d9a0' : '#f43f5e',
                    fontWeight: 700,
                  }}
                >
                  {(ticker?.priceChangePercent || 0) >= 0 ? '+' : ''}
                  {ticker?.priceChangePercent?.toFixed(2) || '0.00'}%
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Binance Spot Canlı</div>
            </div>

            <div style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: 14 }}>
              ${ticker?.lastPrice ? ticker.lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '...'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 8 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>24s En Yüksek</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>${ticker?.highPrice.toLocaleString() || '-'}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 8 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>24s En Düşük</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>${ticker?.lowPrice.toLocaleString() || '-'}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 8 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>24s Hacim</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{ticker ? Math.round(ticker.volume).toLocaleString() : '-'}</div>
              </div>
            </div>
          </div>

          {/* Technical Indicators Card */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Activity size={18} style={{ color: 'var(--accent-blue)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Canlı Teknik Göstergeler ({selectedTimeframe})</h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {/* RSI */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RSI (14)</span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color:
                        (metrics?.rsi || 50) > 70 ? '#f43f5e' : (metrics?.rsi || 50) < 30 ? '#10d9a0' : 'var(--text-secondary)',
                    }}
                  >
                    {(metrics?.rsi || 50) > 70 ? 'Aşırı Alım' : (metrics?.rsi || 50) < 30 ? 'Aşırı Satım' : 'Dengeli'}
                  </span>
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{metrics?.rsi || 50}</div>
              </div>

              {/* Trend */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>EMA Trend Yönü</div>
                <div
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 800,
                    color:
                      metrics?.trend === 'UPTREND' ? '#10d9a0' : metrics?.trend === 'DOWNTREND' ? '#f43f5e' : 'var(--text-muted)',
                  }}
                >
                  {metrics?.trend === 'UPTREND'
                    ? '▲ YUKARI (Boğa)'
                    : metrics?.trend === 'DOWNTREND'
                    ? '▼ AŞAĞI (Ayı)'
                    : '■ YATAY (Konsolide)'}
                </div>
              </div>

              {/* EMA 9 */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hızlı EMA (9)</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: 4 }}>
                  ${metrics?.ema9 ? metrics.ema9.toFixed(2) : '-'}
                </div>
              </div>

              {/* EMA 21 */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Yavaş EMA (21)</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: 4 }}>
                  ${metrics?.ema21 ? metrics.ema21.toFixed(2) : '-'}
                </div>
              </div>
            </div>

            {/* Support / Resistance */}
            <div
              style={{
                marginTop: 14,
                padding: '10px 14px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: 8,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.8rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Destek Seviyesi: </span>
                <strong style={{ color: '#10d9a0' }}>${metrics?.supportLevel ? metrics.supportLevel.toFixed(2) : '-'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Direnç Seviyesi: </span>
                <strong style={{ color: '#f43f5e' }}>${metrics?.resistanceLevel ? metrics.resistanceLevel.toFixed(2) : '-'}</strong>
              </div>
            </div>
          </div>

          {/* Account Balance for this strategy */}
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Paper Trading Hesap Bakiyesi</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 2 }}>
                  ${account ? account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '10,000.00'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Açık Pozisyon</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: 2 }}>
                  {currentActivePosition ? (
                    <span style={{ color: currentActivePosition.direction === 'long' ? '#10d9a0' : '#f43f5e' }}>
                      {currentActivePosition.direction.toUpperCase()} ({currentActivePosition.leverage || 1}x)
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Yok</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: AI Decision Hub & Order Execution */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ai-card-glow" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Zap size={20} style={{ color: '#38bdf8' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>AI Karar İstasyonu</h3>
              </div>

              {/* Analysis Button */}
              <button
                onClick={() => runAiAnalysis(false)}
                disabled={analyzing || !llmStatus.isOnline}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: analyzing || !llmStatus.isOnline ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
                  opacity: analyzing || !llmStatus.isOnline ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {analyzing ? (
                  <>
                    <RefreshCw size={16} className="loading-spinner" />
                    <span>LLM Analiz Ediyor...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Piyasayı Analiz Et</span>
                  </>
                )}
              </button>
            </div>

            {/* Error Message */}
            {decisionError && (
              <div
                style={{
                  background: 'rgba(244, 63, 94, 0.12)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: '0.82rem',
                  color: '#f43f5e',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <XCircle size={16} style={{ flexShrink: 0 }} />
                <span>{decisionError}</span>
              </div>
            )}

            {/* Success Message */}
            {tradeSuccessMsg && (
              <div
                style={{
                  background: 'rgba(16, 217, 160, 0.12)',
                  border: '1px solid rgba(16, 217, 160, 0.3)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: '0.82rem',
                  color: '#10d9a0',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <CheckCircle size={16} style={{ flexShrink: 0 }} />
                <span>{tradeSuccessMsg}</span>
              </div>
            )}

            {/* Decision Display */}
            {aiDecision ? (
              <div>
                {/* Direction and Confidence Header */}
                <div
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '18px 20px',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Önerilen İşlem Yönü
                      </span>
                      <div style={{ marginTop: 4 }}>
                        {aiDecision.direction === 'LONG' && (
                          <span
                            style={{
                              fontSize: '1.4rem',
                              fontWeight: 900,
                              color: '#10d9a0',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            🟢 LONG (ALIM)
                          </span>
                        )}
                        {aiDecision.direction === 'SHORT' && (
                          <span
                            style={{
                              fontSize: '1.4rem',
                              fontWeight: 900,
                              color: '#f43f5e',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            🔴 SHORT (SATIŞ)
                          </span>
                        )}
                        {aiDecision.direction === 'WAIT' && (
                          <span
                            style={{
                              fontSize: '1.4rem',
                              fontWeight: 900,
                              color: '#f59e0b',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            ⚪ BEKLE (Fırsat Yok)
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Güven Skoru
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4 }}>
                        %{aiDecision.confidence}
                      </div>
                    </div>
                  </div>

                  {/* Confidence Bar */}
                  <div className="confidence-track">
                    <div
                      className="confidence-fill"
                      style={{
                        width: `${aiDecision.confidence}%`,
                        background:
                          aiDecision.confidence >= 75
                            ? 'linear-gradient(90deg, #10d9a0, #38bdf8)'
                            : aiDecision.confidence >= 50
                            ? 'linear-gradient(90deg, #f59e0b, #eab308)'
                            : '#f43f5e',
                      }}
                    />
                  </div>
                </div>

                {/* Trade Setup Grid */}
                {aiDecision.direction !== 'WAIT' && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 10,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Giriş Fiyatı</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                        ${aiDecision.entry_price.toLocaleString()}
                      </div>
                    </div>

                    <div style={{ background: 'rgba(244, 63, 94, 0.08)', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.7rem', color: '#f43f5e' }}>Stop Loss (SL)</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f43f5e' }}>
                        ${aiDecision.stop_loss.toLocaleString()}
                      </div>
                    </div>

                    <div style={{ background: 'rgba(16, 217, 160, 0.08)', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.7rem', color: '#10d9a0' }}>Take Profit (TP)</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#10d9a0' }}>
                        ${aiDecision.take_profit.toLocaleString()}
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Önerilen Kaldıraç</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{aiDecision.leverage}x</div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Önerilen Marjin</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>${aiDecision.position_size_usd}</div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Risk / Ödül</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38bdf8' }}>
                        {aiDecision.risk_reward_ratio}
                      </div>
                    </div>
                  </div>
                )}

                {/* Reasoning & Thesis */}
                <div
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 8,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa', marginBottom: 6 }}>
                    YAPAY ZEKA ANALİST RAPORU
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
                    {aiDecision.reasoning}
                  </p>
                  {aiDecision.risk_assessment && (
                    <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <strong>Risk Notu:</strong> {aiDecision.risk_assessment}
                    </div>
                  )}
                </div>

                {/* Execution Button */}
                {aiDecision.direction !== 'WAIT' && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      onClick={() => handleExecuteTrade()}
                      disabled={executingTrade}
                      style={{
                        flex: 1,
                        background:
                          aiDecision.direction === 'LONG'
                            ? 'linear-gradient(135deg, #10b981, #059669)'
                            : 'linear-gradient(135deg, #f43f5e, #e11d48)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 10,
                        padding: '14px 20px',
                        fontSize: '0.95rem',
                        fontWeight: 800,
                        cursor: executingTrade ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        boxShadow:
                          aiDecision.direction === 'LONG'
                            ? '0 4px 20px rgba(16, 185, 129, 0.4)'
                            : '0 4px 20px rgba(244, 63, 94, 0.4)',
                        transition: 'all 0.2s',
                      }}
                    >
                      {executingTrade ? (
                        <>
                          <RefreshCw size={18} className="loading-spinner" />
                          <span>Emir İletiliyor...</span>
                        </>
                      ) : (
                        <>
                          <Target size={18} />
                          <span>
                            AI Kararını Yürüt: {aiDecision.direction} Pozisyonu Aç (${aiDecision.position_size_usd} @{' '}
                            {aiDecision.leverage}x)
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Empty state before first analysis */
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 12,
                  border: '1px dashed var(--border)',
                }}
              >
                <Sparkles size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
                <h4 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 6 }}>Henüz Karar Üretilmedi</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: 400, margin: '0 auto 16px' }}>
                  Yerel LLM modeliniz son mumları ve indikatörleri inceleyerek disiplinli bir alım-satım planı oluşturmak
                  için hazır.
                </p>
                <button
                  onClick={() => runAiAnalysis(false)}
                  disabled={analyzing || !llmStatus.isOnline}
                  style={{
                    background: 'var(--accent-blue)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 16px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: analyzing || !llmStatus.isOnline ? 'not-allowed' : 'pointer',
                  }}
                >
                  Analizi Başlat
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active AI Positions Table */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={18} style={{ color: '#10d9a0' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Açık Pozisyonlar ({openPositions.length})</h3>
          </div>
          <button
            onClick={loadDatabaseData}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.75rem',
            }}
          >
            <RefreshCw size={13} />
            <span>Listeyi Güncelle</span>
          </button>
        </div>

        {openPositions.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Sembol</th>
                <th>Yön</th>
                <th>Kaldıraç</th>
                <th>Giriş Fiyatı</th>
                <th>Anlık Fiyat</th>
                <th>Stop Loss</th>
                <th>Take Profit</th>
                <th>Büyüklük</th>
                <th>Açılış Zamanı</th>
                <th style={{ textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {openPositions.map((pos) => {
                const currentPrice = ticker && ticker.symbol === pos.symbol ? ticker.lastPrice : pos.entry_price
                const grossPnl =
                  pos.direction === 'long'
                    ? (currentPrice - pos.entry_price) * pos.size
                    : (pos.entry_price - currentPrice) * pos.size
                const isProfit = grossPnl >= 0

                return (
                  <tr key={pos.id}>
                    <td>
                      <strong>{pos.symbol}</strong>
                    </td>
                    <td>
                      <span className={`badge badge-${pos.direction}`}>
                        {pos.direction.toUpperCase()}
                      </span>
                    </td>
                    <td>{pos.leverage ? `${pos.leverage}x` : '1x'}</td>
                    <td>${Number(pos.entry_price).toLocaleString()}</td>
                    <td>${currentPrice.toLocaleString()}</td>
                    <td style={{ color: '#f43f5e' }}>${Number(pos.stop_loss).toLocaleString()}</td>
                    <td style={{ color: '#10d9a0' }}>${Number(pos.take_profit).toLocaleString()}</td>
                    <td>{pos.size}</td>
                    <td>
                      {new Date(pos.opened_at).toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleClosePosition(pos.id, currentPrice)}
                        style={{
                          background: 'rgba(244, 63, 94, 0.15)',
                          border: '1px solid rgba(244, 63, 94, 0.3)',
                          color: '#f43f5e',
                          borderRadius: 6,
                          padding: '5px 10px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Kapat (${grossPnl.toFixed(2)})
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Şu anda açık bir pozisyon bulunmamaktadır.
          </div>
        )}
      </div>

      {/* AI Karar Günlüğü & Log Stream */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={18} style={{ color: 'var(--accent-purple)' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>AI Pilot Karar ve Log Günlüğü</h3>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Son 20 Analiz / İşlem</span>
        </div>

        {pilotLogs.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Zaman</th>
                <th>Sembol</th>
                <th>Aksiyon</th>
                <th>Model</th>
                <th>Özet / Gerekçe</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {pilotLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                    {new Date(log.created_at).toLocaleTimeString('tr-TR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td>
                    <strong>{log.symbol}</strong>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 4,
                        background:
                          log.action === 'ORDER_OPENED'
                            ? 'rgba(16, 217, 160, 0.2)'
                            : log.action === 'ANALYSIS'
                            ? 'rgba(56, 189, 248, 0.2)'
                            : 'rgba(255,255,255,0.05)',
                        color:
                          log.action === 'ORDER_OPENED'
                            ? '#10d9a0'
                            : log.action === 'ANALYSIS'
                            ? '#38bdf8'
                            : 'var(--text-secondary)',
                      }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{log.model_used}</td>
                  <td style={{ fontSize: '0.82rem', maxWidth: 400 }}>
                    {log.prompt_summary || JSON.stringify(log.decision).slice(0, 100)}
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color:
                          log.status === 'EXECUTED'
                            ? '#10d9a0'
                            : log.status === 'FAILED'
                            ? '#f43f5e'
                            : 'var(--text-muted)',
                      }}
                    >
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {loadingLogs ? 'Loglar yükleniyor...' : 'Kayıtlı bir AI pilot aksiyonu bulunmuyor.'}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 500,
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sliders size={20} style={{ color: 'var(--accent-purple)' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Yerel LLM Yapılandırması</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <XCircle size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Yerel LLM API Uç Noktası (Endpoint):
                </label>
                <input
                  type="text"
                  value={endpointInput}
                  onChange={(e) => setEndpointInput(e.target.value)}
                  placeholder="http://localhost:1234/v1"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                  LM Studio varsayılanı: <code>http://localhost:1234/v1</code> | Ollama: <code>http://localhost:11434/v1</code>
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Model Seçimi:
                </label>
                {llmStatus.models.length > 0 ? (
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                    }}
                  >
                    {llmStatus.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    placeholder="Örn: Qwen2.5-Coder-7B-Instruct-4bit"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                    }}
                  />
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Otonom Pilot Güven Eşiği: %{autoPilotMinConfidence}
                </label>
                <input
                  type="range"
                  min={50}
                  max={95}
                  step={5}
                  value={autoPilotMinConfidence}
                  onChange={(e) => setAutoPilotMinConfidence(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                  Modelin güven skoru bu eşiğin üzerindeyse otomatik pozisyon açılır.
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Otonom Tarama Aralığı (Dakika): {autoPilotIntervalMinutes} dk
                </label>
                <select
                  value={autoPilotIntervalMinutes}
                  onChange={(e) => setAutoPilotIntervalMinutes(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value={1}>1 Dakika (Hızlı Test)</option>
                  <option value={3}>3 Dakika</option>
                  <option value={5}>5 Dakika (Önerilen)</option>
                  <option value={15}>15 Dakika (Mum Kapanışı)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    borderRadius: 6,
                    padding: '8px 14px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  İptal
                </button>
                <button
                  onClick={handleSaveSettings}
                  style={{
                    background: 'var(--accent-blue)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 18px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Kaydet & Bağlan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
