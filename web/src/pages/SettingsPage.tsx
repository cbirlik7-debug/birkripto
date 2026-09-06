import { useEffect, useState } from 'react'
import { supabase, BotConfig, supabaseUrl, supabaseAnonKey, isConfigured, updateSupabaseCredentials } from '../lib/supabaseClient'
import { Save, RefreshCw, Key, Database, CheckCircle2 } from 'lucide-react'

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

  // Supabase bağlantı ayarları
  const [urlInput, setUrlInput] = useState(supabaseUrl)
  const [keyInput, setKeyInput] = useState(isConfigured() ? supabaseAnonKey : '')
  const [credSaved, setCredSaved] = useState(false)

  useEffect(() => {
    loadConfigs()
  }, [])

  async function loadConfigs() {
    try {
      const { data } = await supabase.from('bot_config').select('*')
      setConfigs(data ?? [])
    } catch (e) {
      console.error('Config fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  function handleSaveCredentials(e: React.FormEvent) {
    e.preventDefault()
    if (!keyInput.trim()) {
      alert('Lütfen Supabase anon key değerini girin.')
      return
    }
    updateSupabaseCredentials(urlInput.trim(), keyInput.trim())
    setCredSaved(true)
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
        <p>Supabase API bağlantısı ve bot konfigürasyon parametreleri</p>
      </div>

      {/* Supabase Bağlantı Kartı */}
      <div className="card" style={{ marginBottom: 24, border: '1px solid rgba(59, 130, 246, 0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Database size={20} color="var(--accent-blue)" />
          <h3 style={{ fontWeight: 700, fontSize: '1.1rem' }}>Supabase Bağlantısı</h3>
          {isConfigured() ? (
            <span style={{ fontSize: '0.75rem', background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)', padding: '2px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={12} /> Bağlı
            </span>
          ) : (
            <span style={{ fontSize: '0.75rem', background: 'rgba(245,158,11,0.15)', color: 'var(--accent-yellow)', padding: '2px 8px', borderRadius: 4 }}>
              Anahtar Bekleniyor
            </span>
          )}
        </div>

        <form onSubmit={handleSaveCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Supabase Project URL
            </label>
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://xxxxxxxx.supabase.co"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Supabase Anon Public Key (eyJhbGciOi...)
            </label>
            <input
              type="password"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>
              Supabase panelinizde <strong>Project Settings → API → Project API keys (anon public)</strong> bölümünden kopyalayın.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
            <button
              type="submit"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 22px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent-blue)',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.9rem',
              }}
            >
              <Key size={15} />
              Bağlantıyı Kaydet ve Yenile
            </button>
            {credSaved && (
              <span style={{ color: 'var(--accent-green)', fontSize: '0.85rem' }}>
                ✓ Bilgiler kaydedildi!
              </span>
            )}
          </div>
        </form>
      </div>

      {successMsg && (
        <div style={{ padding: '12px 20px', background: 'var(--accent-green-glow)', border: '1px solid rgba(16,217,160,0.3)', borderRadius: 10, marginBottom: 20, color: 'var(--accent-green)', fontWeight: 500 }}>
          ✓ {successMsg}
        </div>
      )}

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner" />
        </div>
      ) : configs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
            Henüz veritabanında bot konfigürasyonu bulunamadı.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Supabase SQL Editor'de <code>0001_init.sql</code> dosyasını çalıştırdığınızdan ve yukarıdaki bağlantı anahtarınızı doğru girdiğinizden emin olun.
          </p>
        </div>
      ) : (
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
