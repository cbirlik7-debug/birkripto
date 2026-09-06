import { useEffect, useState } from 'react'
import { supabase, Trade } from '../lib/supabaseClient'

export default function Trades() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ symbol: 'all', direction: 'all' })

  useEffect(() => { loadTrades() }, [filter])

  async function loadTrades() {
    setLoading(true)
    let q = supabase.from('trades').select('*').order('closed_at', { ascending: false }).limit(100)
    if (filter.symbol !== 'all') q = q.eq('symbol', filter.symbol)
    if (filter.direction !== 'all') q = q.eq('direction', filter.direction)
    const { data } = await q
    setTrades(data ?? [])
    setLoading(false)
  }

  const totalPnl = trades.reduce((s, t) => s + Number(t.pnl || 0), 0)
  const totalCommission = trades.reduce((s, t) => s + Number(t.commission || 0), 0)
  const winCount = trades.filter(t => Number(t.pnl || 0) > 0).length
  const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0

  return (
    <div>
      <div className="page-header">
        <h2>Trade Geçmişi</h2>
        <p>Kapanmış tüm paper trade'lerin kâr/zarar, kaldıraç ve komisyon detayları</p>
      </div>

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Toplam Net PnL</div>
          <div className="stat-value" style={{ color: totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
          </div>
          <div className="stat-sub">Komisyonlar düşülmüş</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Toplam Ödenen Komisyon</div>
          <div className="stat-value" style={{ color: 'var(--accent-yellow)' }}>
            ${totalCommission.toFixed(3)}
          </div>
          <div className="stat-sub">Binance Vadeli komisyonu</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Win Rate</div>
          <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>{winRate.toFixed(1)}%</div>
          <div className="stat-sub">{winCount} kazanç / {trades.length} trade</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Toplam Kapanan Trade</div>
          <div className="stat-value">{trades.length}</div>
          <div className="stat-sub">Geçmiş işlemler</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {['all', 'BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map(s => (
            <button key={s} onClick={() => setFilter(f => ({ ...f, symbol: s }))}
              style={{
                padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)',
                background: filter.symbol === s ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                color: filter.symbol === s ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
              }}>
              {s === 'all' ? 'Tümü' : s}
            </button>
          ))}
          <div style={{ width: 1, background: 'var(--border)' }} />
          {['all', 'long', 'short'].map(d => (
            <button key={d} onClick={() => setFilter(f => ({ ...f, direction: d }))}
              style={{
                padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)',
                background: filter.direction === d ? 'var(--accent-purple)' : 'var(--bg-secondary)',
                color: filter.direction === d ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
              }}>
              {d === 'all' ? 'Yön: Tümü' : d.toUpperCase()}
            </button>
          ))}
        </div>

        {loading ? <div className="loading-container"><div className="loading-spinner" /></div> : (
          <table className="data-table">
            <thead><tr>
              <th>Tarih</th><th>Symbol</th><th>Kaldıraç</th><th>Yön</th><th>Giriş</th><th>Çıkış</th>
              <th>Net PnL</th><th>ROE%</th><th>Ödenen Komisyon</th><th>Çıkış Nedeni</th>
            </tr></thead>
            <tbody>
              {trades.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0' }}>Henüz kapanmış trade bulunmuyor.</td></tr>}
              {trades.map(t => {
                const lev = t.leverage || 5
                return (
                  <tr key={t.id}>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>{new Date(t.closed_at).toLocaleString('tr-TR')}</td>
                    <td style={{ fontWeight: 600 }}>{t.symbol}</td>
                    <td>
                      <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: 'var(--accent-yellow)', fontWeight: 700 }}>
                        {lev}x
                      </span>
                    </td>
                    <td><span className={`badge badge-${t.direction}`}>{t.direction.toUpperCase()}</span></td>
                    <td>${Number(t.entry_price).toLocaleString()}</td>
                    <td>${Number(t.exit_price).toLocaleString()}</td>
                    <td style={{ color: Number(t.pnl) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700 }}>
                      {Number(t.pnl) >= 0 ? '+' : ''}${Number(t.pnl).toFixed(2)}
                    </td>
                    <td style={{ color: Number(t.pnl_pct) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>
                      {Number(t.pnl_pct) >= 0 ? '+' : ''}{(Number(t.pnl_pct) * (lev / 5)).toFixed(2)}%
                    </td>
                    <td style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>
                      -${Number(t.commission || 0).toFixed(3)} USDT
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--bg-secondary)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {t.exit_reason === 'manual_market_close' ? 'Piyasa Kapatma' : t.exit_reason === 'take_profit' ? 'Take Profit' : t.exit_reason === 'stop_loss' ? 'Stop Loss' : t.exit_reason}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
