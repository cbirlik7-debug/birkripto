import { useEffect, useState } from 'react'
import { supabase, BotConfig, StrategyAccount, Trade, Signal, Position } from '../lib/supabaseClient'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { RefreshCw, RotateCcw, CheckCircle2, TrendingUp, TrendingDown, DollarSign, Activity, Zap } from 'lucide-react'

interface DashboardData {
  configs: (BotConfig & { account?: StrategyAccount })[]
  recentTrades: Trade[]
  recentSignals: Signal[]
  openPositions: Position[]
  equityData: { time: string; [key: string]: number | string }[]
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [runMessage, setRunMessage] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [{ data: configs }, { data: accounts }, { data: trades }, { data: signals }, { data: positions }, { data: equity }] = await Promise.all([
        supabase.from('bot_config').select('*').eq('is_active', true),
        supabase.from('strategy_accounts').select('*'),
        supabase.from('trades').select('*').order('closed_at', { ascending: false }).limit(5),
        supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('positions').select('*').eq('status', 'open'),
        supabase.from('equity_snapshots').select('*').order('created_at', { ascending: true }).limit(100),
      ])

      const configsWithAccounts = (configs ?? []).map(c => ({
        ...c,
        account: accounts?.find(a => a.config_id === c.id),
      }))

      // Equity chart verisi
      const equityMap: Record<string, Record<string, number>> = {}
      for (const snap of equity ?? []) {
        const time = new Date(snap.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        if (!equityMap[time]) equityMap[time] = {}
        const cfg = configsWithAccounts.find(c => c.id === snap.config_id)
        const key = cfg ? cfg.symbol : snap.config_id.slice(0, 8)
        equityMap[time][key] = Number(snap.balance)
      }
      const equityData = Object.entries(equityMap).map(([time, vals]) => ({ time, ...vals }))

      setData({
        configs: configsWithAccounts,
        recentTrades: trades ?? [],
        recentSignals: signals ?? [],
        openPositions: positions ?? [],
        equityData,
      })
    } catch (err) {
      console.error('Error loading dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  async function triggerBotCycle() {
    setTriggering(true)
    try {
      const res = await fetch('https://rromrgcpklrkxkourmie.supabase.co/functions/v1/run-bot-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const result = await res.json()
      if (result.success && result.results) {
        const prices = result.results.map((r: any) => `${r.symbol}: $${Number(r.price).toLocaleString()}`).join(' · ')
        setRunMessage(`✓ Bot döngüsü tamamlandı! Canlı Binance: ${prices}`)
      } else {
        setRunMessage(`Bot yanıtı: ${result.message || 'Döngü tamamlandı'}`)
      }
      await loadData()
    } catch (e: any) {
      setRunMessage(`Bağlantı hatası: ${e.message}`)
    } finally {
      setTriggering(false)
      setTimeout(() => setRunMessage(null), 8000)
    }
  }

  if (loading) return (
    <div className="loading-container">
      <div className="loading-spinner" />
      <span className="text-secondary">Supabase'den canlı veriler çekiliyor...</span>
    </div>
  )

  const totalBalance = data?.configs.reduce((s, c) => s + Number(c.account?.balance ?? 0), 0) ?? 0
  const totalStart = data?.configs.reduce((s, c) => s + Number(c.account?.starting_balance ?? 0), 0) ?? 0
  const totalPnl = totalBalance - totalStart
  const totalPnlPct = totalStart > 0 ? (totalPnl / totalStart) * 100 : 0

  // En son gelen sinyal fiyatları
  const btcSignal = data?.recentSignals.find(s => s.symbol === 'BTCUSDT')
  const ethSignal = data?.recentSignals.find(s => s.symbol === 'ETHUSDT')
  const solSignal = data?.recentSignals.find(s => s.symbol === 'SOLUSDT')

  return (
    <div>
      {/* Header with Run Now Button */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>Dashboard</h2>
          <p>Tüm stratejilerin anlık özeti ve canlı Binance verileri</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={triggerBotCycle}
            disabled={triggering}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: '#fff',
              cursor: triggering ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              boxShadow: '0 4px 14px rgba(59,130,246,0.35)',
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={16} className={triggering ? 'spin' : ''} />
            {triggering ? 'Piyasa Taranıyor...' : '⚡ Botu Şimdi Çalıştır'}
          </button>
          <button
            onClick={loadData}
            title="Verileri Yenile"
            style={{
              padding: '10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {runMessage && (
        <div style={{
          padding: '12px 20px',
          background: 'rgba(16,217,160,0.12)',
          border: '1px solid rgba(16,217,160,0.3)',
          borderRadius: 10,
          marginBottom: 20,
          color: 'var(--accent-green)',
          fontSize: '0.9rem',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          <span>{runMessage}</span>
        </div>
      )}

      {/* Live Market Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14,
        marginBottom: 20,
      }}>
        {[
          { symbol: 'BTCUSDT', label: 'Bitcoin', sig: btcSignal, color: '#3b82f6' },
          { symbol: 'ETHUSDT', label: 'Ethereum', sig: ethSignal, color: '#10d9a0' },
          { symbol: 'SOLUSDT', label: 'Solana', sig: solSignal, color: '#f59e0b' },
        ].map(({ symbol, label, sig, color }) => (
          <div key={symbol} style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label} ({symbol})</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color, marginTop: 2 }}>
                {sig ? `$${Number(sig.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
              </div>
            </div>
            {sig && (
              <div style={{ textAlign: 'right' }}>
                <span className={`badge badge-${sig.direction}`}>{sig.direction.toUpperCase()}</span>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Skor: {sig.score}/4
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stat Cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Toplam Bakiye</div>
          <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>
            ${totalBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-sub">{data?.configs.length} aktif strateji ($10,000 / her biri)</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Toplam PnL</div>
          <div className="stat-value" style={{ color: totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {totalPnl >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%
          </div>
          <div className="stat-sub">${totalPnl.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Açık Pozisyonlar</div>
          <div className="stat-value" style={{ color: 'var(--accent-yellow)' }}>
            {data?.openPositions.length ?? 0}
          </div>
          <div className="stat-sub">aktif trade</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Win Rate</div>
          <div className="stat-value" style={{ color: 'var(--accent-green)' }}>
            {data?.recentTrades.length
              ? `${Math.round((data.recentTrades.filter(t => t.pnl > 0).length / data.recentTrades.length) * 100)}%`
              : '—'}
          </div>
          <div className="stat-sub">{data?.recentTrades.length ?? 0} trade tamamlandı</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Equity Chart */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>📈 Equity Curve (Bakiye Gelişimi)</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {data?.equityData.length ?? 0} veri noktası
            </span>
          </div>

          {data && data.equityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.equityData}>
                <defs>
                  <linearGradient id="gradBTC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradETH" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10d9a0" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10d9a0" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradSOL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" tick={{ fill: '#8b9bb4', fontSize: 11 }} />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fill: '#8b9bb4', fontSize: 11 }}
                  tickFormatter={v => `$${v}`}
                />
                <Tooltip contentStyle={{ background: '#131d35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f0f4ff' }} />
                <Legend />
                <Area type="monotone" dataKey="BTCUSDT" stroke="#3b82f6" fill="url(#gradBTC)" strokeWidth={2} dot={{ r: 3 }} />
                <Area type="monotone" dataKey="ETHUSDT" stroke="#10d9a0" fill="url(#gradETH)" strokeWidth={2} dot={{ r: 3 }} />
                <Area type="monotone" dataKey="SOLUSDT" stroke="#f59e0b" fill="url(#gradSOL)" strokeWidth={2} dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 240, color: 'var(--text-muted)', gap: 12 }}>
              <p style={{ margin: 0 }}>Henüz bakiye geçmişi kaydı yok.</p>
              <button
                onClick={triggerBotCycle}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid var(--accent-blue)',
                  background: 'rgba(59,130,246,0.1)',
                  color: 'var(--accent-blue)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '0.85rem'
                }}
              >
                İlk Döngüyü Şimdi Başlat
              </button>
            </div>
          )}
        </div>

        {/* Açık Pozisyonlar */}
        <div className="card">
          <h3 style={{ marginBottom: 20, fontSize: '1rem', fontWeight: 600 }}>⚡ Açık Pozisyonlar</h3>
          {data?.openPositions.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px 0' }}>
              Şu anda açık pozisyon bulunmuyor (Nötr piyasa veya bekleme durumunda)
            </div>
          ) : (
            data?.openPositions.map(pos => {
              const livePrice = data.recentSignals.find(s => s.symbol === pos.symbol)?.price ?? pos.entry_price
              const unrealized = pos.direction === 'long'
                ? (livePrice - pos.entry_price) * pos.size
                : (pos.entry_price - livePrice) * pos.size
              return (
                <div key={pos.id} style={{ padding: '14px', background: 'var(--bg-secondary)', borderRadius: 10, marginBottom: 10, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600 }}>{pos.symbol}</span>
                    <span className={`badge badge-${pos.direction}`}>{pos.direction.toUpperCase()}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <div>Giriş: <strong style={{ color: 'var(--text-primary)' }}>${pos.entry_price.toFixed(2)}</strong></div>
                    <div>Anlık: <strong style={{ color: 'var(--accent-blue)' }}>${livePrice.toFixed(2)}</strong></div>
                    <div>SL: <strong style={{ color: 'var(--accent-red)' }}>${pos.stop_loss.toFixed(2)}</strong></div>
                    <div>TP: <strong style={{ color: 'var(--accent-green)' }}>${pos.take_profit.toFixed(2)}</strong></div>
                    <div>Boyut: <strong style={{ color: 'var(--text-primary)' }}>{pos.size.toFixed(4)}</strong></div>
                    <div>PnL: <strong style={{ color: unrealized >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>${unrealized.toFixed(2)}</strong></div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Son Sinyaller */}
      <div className="card">
        <h3 style={{ marginBottom: 20, fontSize: '1rem', fontWeight: 600 }}>🔔 Son Üretilen Sinyaller (Binance)</h3>
        <table className="data-table">
          <thead><tr>
            <th>Zaman</th><th>Symbol</th><th>Yön</th><th>Skor</th><th>Fiyat</th><th>Gerekçe</th>
          </tr></thead>
          <tbody>
            {data?.recentSignals.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Henüz sinyal üretilmedi. "Botu Şimdi Çalıştır" butonuna tıklayabilirsiniz.</td></tr>
            )}
            {data?.recentSignals.map(s => (
              <tr key={s.id}>
                <td className="text-muted" style={{ fontSize: '0.8rem' }}>{new Date(s.created_at).toLocaleString('tr-TR')}</td>
                <td style={{ fontWeight: 600 }}>{s.symbol}</td>
                <td><span className={`badge badge-${s.direction}`}>{s.direction.toUpperCase()}</span></td>
                <td style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>{s.score}/4</td>
                <td>${Number(s.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.reasons?.slice(0, 2).join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
