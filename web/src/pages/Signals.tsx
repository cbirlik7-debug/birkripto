import { useEffect, useState } from 'react'
import { supabase, Signal } from '../lib/supabaseClient'

export default function Signals() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSignals()
    // Realtime: yeni sinyal geldiğinde güncelle
    const channel = supabase.channel('signals-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, (payload) => {
        setSignals(prev => [payload.new as Signal, ...prev].slice(0, 50))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function loadSignals() {
    const { data } = await supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(50)
    setSignals(data ?? [])
    setLoading(false)
  }

  const longCount = signals.filter(s => s.direction === 'long').length
  const shortCount = signals.filter(s => s.direction === 'short').length
  const neutralCount = signals.filter(s => s.direction === 'neutral').length

  return (
    <div>
      <div className="page-header">
        <h2>Sinyal Logu</h2>
        <p>Bot'un ürettiği tüm sinyaller — neden long/short/neutral olduğu</p>
      </div>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">LONG Sinyali</div>
          <div className="stat-value text-green">{longCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">SHORT Sinyali</div>
          <div className="stat-value text-red">{shortCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">NEUTRAL</div>
          <div className="stat-value text-muted">{neutralCount}</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div className="live-dot" />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Gerçek zamanlı güncelleniyor</span>
        </div>
        {loading ? <div className="loading-container"><div className="loading-spinner" /></div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {signals.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Henüz sinyal yok</div>}
            {signals.map(s => (
              <div key={s.id} style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700 }}>{s.symbol}</span>
                    <span className={`badge badge-${s.direction}`}>{s.direction}</span>
                    <span style={{ fontSize: '0.8rem', background: 'var(--bg-card)', padding: '2px 10px', borderRadius: 6, color: 'var(--accent-yellow)' }}>
                      Skor: {s.score}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(s.created_at).toLocaleString('tr-TR')}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-blue)' }}>${s.price.toLocaleString()}</div>
                  </div>
                </div>
                {s.reasons?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {s.reasons.map((r, i) => (
                      <span key={i} style={{ fontSize: '0.75rem', padding: '3px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 6, color: 'var(--text-secondary)' }}>
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
