import { useEffect, useState } from 'react'
import { supabase, BotConfig, StrategyAccount, Trade, Signal, Position } from '../lib/supabaseClient'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react'

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
        supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(5),
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
        const time = new Date(snap.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        if (!equityMap[time]) equityMap[time] = {}
        const cfg = configsWithAccounts.find(c => c.id === snap.config_id)
        const key = cfg ? cfg.symbol : snap.config_id.slice(0, 8)
        equityMap[time][key] = snap.balance
      }
      const equityData = Object.entries(equityMap).map(([time, vals]) => ({ time, ...vals }))

      setData({
        configs: configsWithAccounts,
        recentTrades: trades ?? [],
        recentSignals: signals ?? [],
        openPositions: positions ?? [],
        equityData,
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="loading-container">
      <div className="loading-spinner" />
      <span className="text-secondary">Veriler yükleniyor...</span>
    </div>
  )

  const totalBalance = data?.configs.reduce((s, c) => s + (c.account?.balance ?? 0), 0) ?? 0
  const totalStart = data?.configs.reduce((s, c) => s + (c.account?.starting_balance ?? 0), 0) ?? 0
  const totalPnl = totalBalance - totalStart
  const totalPnlPct = totalStart > 0 ? (totalPnl / totalStart) * 100 : 0

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Tüm stratejilerin anlık özeti</p>
      </div>

      {/* Stat Cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Toplam Bakiye</div>
          <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>
            ${totalBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-sub">{data?.configs.length} aktif strateji</div>
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
          <div className="stat-label">Son 5 Trade Win Rate</div>
          <div className="stat-value" style={{ color: 'var(--accent-green)' }}>
            {data?.recentTrades.length
              ? `${Math.round((data.recentTrades.filter(t => t.pnl > 0).length / data.recentTrades.length) * 100)}%`
              : '—'}
          </div>
          <div className="stat-sub">{data?.recentTrades.length ?? 0} trade</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Equity Chart */}
        <div className="card">
          <h3 style={{ marginBottom: 20, fontSize: '1rem', fontWeight: 600 }}>📈 Equity Curve</h3>
          {data?.equityData.length ? (
            <ResponsiveContainer width="100%" height={220}>
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
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" tick={{ fill: '#4a5a7a', fontSize: 11 }} />
                <YAxis tick={{ fill: '#4a5a7a', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#131d35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f0f4ff' }} />
                <Legend />
                <Area type="monotone" dataKey="BTCUSDT" stroke="#3b82f6" fill="url(#gradBTC)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="ETHUSDT" stroke="#10d9a0" fill="url(#gradETH)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: 'var(--text-muted)' }}>
              Henüz veri yok. Bot ilk çalıştığında grafik oluşacak.
            </div>
          )}
        </div>

        {/* Açık Pozisyonlar */}
        <div className="card">
          <h3 style={{ marginBottom: 20, fontSize: '1rem', fontWeight: 600 }}>⚡ Açık Pozisyonlar</h3>
          {data?.openPositions.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
              Açık pozisyon yok
            </div>
          ) : (
            data?.openPositions.map(pos => {
              const unrealized = pos.direction === 'long'
                ? ((data.recentSignals[0]?.price ?? pos.entry_price) - pos.entry_price) * pos.size
                : (pos.entry_price - (data.recentSignals[0]?.price ?? pos.entry_price)) * pos.size
              return (
                <div key={pos.id} style={{ padding: '14px', background: 'var(--bg-secondary)', borderRadius: 10, marginBottom: 10, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600 }}>{pos.symbol}</span>
                    <span className={`badge badge-${pos.direction}`}>{pos.direction.toUpperCase()}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <div>Giriş: <strong style={{ color: 'var(--text-primary)' }}>${pos.entry_price.toFixed(2)}</strong></div>
                    <div>SL: <strong style={{ color: 'var(--accent-red)' }}>${pos.stop_loss.toFixed(2)}</strong></div>
                    <div>TP: <strong style={{ color: 'var(--accent-green)' }}>${pos.take_profit.toFixed(2)}</strong></div>
                    <div>Boyut: <strong style={{ color: 'var(--text-primary)' }}>{pos.size.toFixed(4)}</strong></div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Son Sinyaller */}
      <div className="card">
        <h3 style={{ marginBottom: 20, fontSize: '1rem', fontWeight: 600 }}>🔔 Son Sinyaller</h3>
        <table className="data-table">
          <thead><tr>
            <th>Zaman</th><th>Symbol</th><th>Yön</th><th>Skor</th><th>Fiyat</th><th>Gerekçe</th>
          </tr></thead>
          <tbody>
            {data?.recentSignals.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Henüz sinyal yok</td></tr>
            )}
            {data?.recentSignals.map(s => (
              <tr key={s.id}>
                <td className="text-muted" style={{ fontSize: '0.8rem' }}>{new Date(s.created_at).toLocaleString('tr-TR')}</td>
                <td style={{ fontWeight: 600 }}>{s.symbol}</td>
                <td><span className={`badge badge-${s.direction}`}>{s.direction}</span></td>
                <td style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>{s.score}</td>
                <td>${s.price.toLocaleString()}</td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
