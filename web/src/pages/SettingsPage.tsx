import { useEffect, useState } from 'react'
import { supabase, BotConfig } from '../lib/supabaseClient'
import { Save, RefreshCw } from 'lucide-react'

const RISK_PRESETS = {
  low:    { min_confluence_score: 4, risk_per_trade_pct: 1, sl_atr_multiplier: 1.5, tp_atr_multiplier: 2 },
  medium: { min_confluence_score: 3, risk_per_trade_pct: 2, sl_atr_multiplier: 2,   tp_atr_multiplier: 3 },
  high:   { min_confluence_score: 2, risk_per_trade_pct: 4, sl_atr_multiplier: 3,   tp_atr_multiplier: 4 },
}

const ALL_INDICATORS = ['ema', 'rsi', 'atr', 'volume_profile']

export default function SettingsPage() {
  const [configs, setConfigs] = useState<BotConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [edited, setEdited] = useState<Record<string, Partial<BotConfig>>>({})
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => { loadConfigs() }, [])

  async function loadConfigs() {
    const { data } = await supabase.from('bot_config').select('*')
    setConfigs(data ?? [])
    setLoading(false)
  }

  function getVal(cfg: BotConfig, field: keyof BotConfig) {
    return (edited[cfg.id]?.[field] ?? cfg[field]) as any
  }

  function setField(cfgId: string, field: keyof BotConfig, value: any) {
    setEdited(e => ({ ...e, [cfgId]: { ...e[cfgId], [field]: value } }))
  }

  function applyRiskPreset(cfgId: string, level: 'low' | 'medium' | 'high') {
    const preset = RISK_PRESETS[level]
    setEdited(e => ({ ...e, [cfgId]: { ...e[cfgId], risk_level: level, ...preset } }))
  }

  function toggleIndicator(cfgId: string, ind: string, current: string[]) {
    const next = current.includes(ind) ? current.filter(i => i !== ind) : [...current, ind]
    setField(cfgId, 'enabled_indicators', next)
  }

  async function saveConfig(cfg: BotConfig) {
    setSaving(cfg.id)
    const changes = edited[cfg.id] ?? {}
    // Ayar değişikliği için Edge Function üzerinden güncelle (anon key ile direkt write yoktur)
    // Burada basitlik için Supabase RPC kullanılıyor — production'da Edge Function kullanın
    const { error } = await supabase.from('bot_config').update(changes).eq('id', cfg.id)
    if (!error) {
      setConfigs(cs => cs.map(c => c.id === cfg.id ? { ...c, ...changes } : c))
      setEdited(e => { const n = { ...e }; delete n[cfg.id]; return n })
      setSuccessMsg(`${cfg.symbol} ayarları kaydedildi!`)
      setTimeout(() => setSuccessMsg(null), 3000)
    }
    setSaving(null)
  }

  return (
    <div>
      <div className="page-header">
        <h2>Ayarlar</h2>
        <p>Asset bazlı bot konfigürasyonu — risk seviyesi, indikatörler ve parametreler</p>
      </div>

      {successMsg && (
        <div style={{ padding: '12px 20px', background: 'var(--accent-green-glow)', border: '1px solid rgba(16,217,160,0.3)', borderRadius: 10, marginBottom: 20, color: 'var(--accent-green)', fontWeight: 500 }}>
          ✓ {successMsg}
        </div>
      )}

      {loading ? <div className="loading-container"><div className="loading-spinner" /></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {configs.map(cfg => (
            <div key={cfg.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: '1.1rem' }}>{cfg.symbol}</h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>Timeframe: {cfg.timeframe}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={getVal(cfg, 'is_active')}
                      onChange={e => setField(cfg.id, 'is_active', e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent-green)' }} />
                    Aktif
                  </label>
                  <button onClick={() => saveConfig(cfg)} disabled={saving === cfg.id || !edited[cfg.id]}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 18px', borderRadius: 8, border: 'none',
                      background: edited[cfg.id] ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                      color: edited[cfg.id] ? '#fff' : 'var(--text-muted)',
                      cursor: edited[cfg.id] ? 'pointer' : 'not-allowed',
                      fontWeight: 600, fontSize: '0.85rem',
                    }}>
                    {saving === cfg.id ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                    Kaydet
                  </button>
                </div>
              </div>

              {/* Risk Level */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Seviyesi</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['low', 'medium', 'high'] as const).map(level => {
                    const isActive = getVal(cfg, 'risk_level') === level
                    const colors = { low: 'var(--accent-green)', medium: 'var(--accent-yellow)', high: 'var(--accent-red)' }
                    return (
                      <button key={level} onClick={() => applyRiskPreset(cfg.id, level)}
                        style={{
                          padding: '8px 20px', borderRadius: 8, border: `1px solid ${isActive ? colors[level] : 'var(--border)'}`,
                          background: isActive ? `${colors[level]}22` : 'var(--bg-secondary)',
                          color: isActive ? colors[level] : 'var(--text-secondary)',
                          cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                        }}>
                        {level.toUpperCase()}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Indicators */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aktif İndikatörler</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {ALL_INDICATORS.map(ind => {
                    const current = getVal(cfg, 'enabled_indicators') as string[]
                    const isOn = current.includes(ind)
                    return (
                      <button key={ind} onClick={() => toggleIndicator(cfg.id, ind, current)}
                        style={{
                          padding: '6px 16px', borderRadius: 8,
                          border: `1px solid ${isOn ? 'rgba(59,130,246,0.5)' : 'var(--border)'}`,
                          background: isOn ? 'rgba(59,130,246,0.15)' : 'var(--bg-secondary)',
                          color: isOn ? 'var(--accent-blue)' : 'var(--text-muted)',
                          cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase',
                        }}>
                        {ind}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Params */}
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Parametreler</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { field: 'min_confluence_score', label: 'Min Confluence', step: 1, min: 1, max: 4 },
                    { field: 'risk_per_trade_pct', label: 'Risk/Trade (%)', step: 0.5, min: 0.5, max: 10 },
                    { field: 'sl_atr_multiplier', label: 'SL ATR Çarpanı', step: 0.5, min: 0.5, max: 5 },
                    { field: 'tp_atr_multiplier', label: 'TP ATR Çarpanı', step: 0.5, min: 1, max: 10 },
                    { field: 'commission_pct', label: 'Komisyon (%)', step: 0.01, min: 0, max: 0.5 },
                  ].map(({ field, label, step, min, max }) => (
                    <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</span>
                      <input type="number" step={step} min={min} max={max}
                        value={getVal(cfg, field as keyof BotConfig)}
                        onChange={e => setField(cfg.id, field as keyof BotConfig, parseFloat(e.target.value))}
                        style={{
                          padding: '8px 12px', borderRadius: 8,
                          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                          color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
