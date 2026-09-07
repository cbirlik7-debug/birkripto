import { useEffect, useState } from 'react'
import { supabase, BotConfig, StrategyAccount, Trade } from '../lib/supabaseClient'

interface StrategyStats {
  config: BotConfig
  account: StrategyAccount | null
  trades: Trade[]
  winRate: number
  totalPnl: number
  maxDrawdown: number
}

interface BacktestResult {
  symbol: string
  timeframe: string
  candleCount: number
  metrics: {
    totalTrades: number
    winRate: number
    totalPnl: number
    maxDrawdown: number
    profitFactor: number | null
  }
}

export default function Strategies() {
  const [strategies, setStrategies] = useState<StrategyStats[]>([])
  const [loading, setLoading] = useState(true)
  const [backtestLoading, setBacktestLoading] = useState<string | null>(null)
  const [backtests, setBacktests] = useState<Record<string, BacktestResult>>({})

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: configs }, { data: accounts }, { data: trades }] = await Promise.all([
      supabase.from('bot_config').select('*'),
      supabase.from('strategy_accounts').select('*'),
      supabase.from('trades').select('*'),
    ])

    const stats: StrategyStats[] = (configs ?? []).map(cfg => {
      const account = accounts?.find(a => a.config_id === cfg.id) ?? null
      const cfgTrades = trades?.filter(t => t.config_id === cfg.id) ?? []
      const wins = cfgTrades.filter(t => t.pnl > 0).length
      const winRate = cfgTrades.length > 0 ? (wins / cfgTrades.length) * 100 : 0
      const totalPnl = cfgTrades.reduce((s, t) => s + t.pnl, 0)
      // Max Drawdown
      let peak = account?.starting_balance ?? 10000
      let maxDD = 0
      let running = peak
      for (const t of cfgTrades) {
        running += t.pnl
        if (running > peak) peak = running
        const dd = ((peak - running) / peak) * 100
        if (dd > maxDD) maxDD = dd
      }
      return { config: cfg, account, trades: cfgTrades, winRate, totalPnl, maxDrawdown: maxDD }
    })

    setStrategies(stats)
    setLoading(false)
  }

  const riskColor = { low: 'var(--accent-green)', medium: 'var(--accent-yellow)', high: 'var(--accent-red)' }

  async function runBacktest(configId: string) {
    setBacktestLoading(configId)
    try {
      const { data, error } = await supabase.functions.invoke('backtest-strategy', {
        body: { config_id: configId, limit: 500 },
      })
      if (error) throw error
      setBacktests(current => ({ ...current, [configId]: data as BacktestResult }))
    } catch (error: any) {
      window.alert(`Backtest çalıştırılamadı: ${error.message}`)
    } finally {
      setBacktestLoading(null)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Strateji Karşılaştırma</h2>
        <p>Farklı konfigürasyonların yan yana performans analizi</p>
      </div>

      {loading ? <div className="loading-container"><div className="loading-spinner" /></div> : (
        <>
          {/* Comparison Table */}
          <div className="card" style={{ marginBottom: 24 }}>
            <table className="data-table">
              <thead><tr>
                <th>Symbol</th><th>Risk</th><th>Bakiye</th><th>Toplam PnL</th>
                <th>Win Rate</th><th>Trade Sayısı</th><th>Max Drawdown</th><th>Timeframe</th>
              </tr></thead>
              <tbody>
                {strategies.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Strateji yok</td></tr>}
                {strategies.map(s => (
                  <tr key={s.config.id}>
                    <td style={{ fontWeight: 700 }}>{s.config.symbol}</td>
                    <td>
                      <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600,
                        background: 'rgba(0,0,0,0.3)', color: riskColor[s.config.risk_level as keyof typeof riskColor] }}>
                        {s.config.risk_level.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>${(s.account?.balance ?? 0).toFixed(2)}</td>
                    <td style={{ color: s.totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>
                      {s.totalPnl >= 0 ? '+' : ''}${s.totalPnl.toFixed(2)}
                    </td>
                    <td style={{ color: s.winRate >= 50 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {s.winRate.toFixed(1)}%
                    </td>
                    <td>{s.trades.length}</td>
                    <td style={{ color: 'var(--accent-red)' }}>{s.maxDrawdown.toFixed(1)}%</td>
                    <td className="text-muted">{s.config.timeframe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Config Detail Cards */}
          <div className="grid-2">
            {strategies.map(s => (
              <div key={s.config.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ fontWeight: 700 }}>{s.config.symbol}</h3>
                  <span style={{ color: riskColor[s.config.risk_level as keyof typeof riskColor], fontWeight: 600, fontSize: '0.85rem' }}>
                    {s.config.risk_level.toUpperCase()} RISK
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.8rem' }}>
                  {[
                    ['Min Confluence', s.config.min_confluence_score],
                    ['Risk/Trade', `${s.config.risk_per_trade_pct}%`],
                    ['SL Çarpanı', `${s.config.sl_atr_multiplier}x ATR`],
                    ['TP Çarpanı', `${s.config.tp_atr_multiplier}x ATR`],
                    ['Komisyon', `${s.config.commission_pct}%`],
                    ['Aktif İndikatörler', (s.config.enabled_indicators as string[]).length],
                  ].map(([label, value]) => (
                    <div key={String(label)} style={{ padding: 10, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 4, fontSize: '0.7rem' }}>{label}</div>
                      <div style={{ fontWeight: 600 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(s.config.enabled_indicators as string[]).map(ind => (
                    <span key={ind} style={{ padding: '2px 10px', borderRadius: 6, background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', fontSize: '0.75rem', fontWeight: 600 }}>
                      {ind.toUpperCase()}
                    </span>
                  ))}
                </div>
                  <button
                    onClick={() => runBacktest(s.config.id)}
                    disabled={backtestLoading === s.config.id}
                    style={{ width: '100%', marginTop: 14, padding: '9px 12px', borderRadius: 7, border: '1px solid var(--accent-blue)', background: 'rgba(59,130,246,0.12)', color: 'var(--accent-blue)', fontWeight: 700, cursor: backtestLoading === s.config.id ? 'not-allowed' : 'pointer' }}
                  >
                    {backtestLoading === s.config.id ? '500 Mum Test Ediliyor...' : '500 Mum Üzerinde Backtest Çalıştır'}
                  </button>
                  {backtests[s.config.id] && (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--bg-secondary)', fontSize: '0.8rem' }}>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
                        {backtests[s.config.id].candleCount} kapalı mum · {backtests[s.config.id].timeframe}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                        <span>Trade: <strong>{backtests[s.config.id].metrics.totalTrades}</strong></span>
                        <span>Win rate: <strong>{backtests[s.config.id].metrics.winRate.toFixed(1)}%</strong></span>
                        <span>Toplam PnL: <strong>{backtests[s.config.id].metrics.totalPnl.toFixed(2)}%</strong></span>
                        <span>Max DD: <strong>{backtests[s.config.id].metrics.maxDrawdown.toFixed(2)}%</strong></span>
                        <span>Profit factor: <strong>{backtests[s.config.id].metrics.profitFactor?.toFixed(2) ?? '∞'}</strong></span>
                      </div>
                    </div>
                  )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
