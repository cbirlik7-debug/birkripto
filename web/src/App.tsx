import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, TrendingUp, Zap, BarChart2, Settings, AlertTriangle } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Trades'
import Signals from './pages/Signals'
import Strategies from './pages/Strategies'
import SettingsPage from './pages/SettingsPage'
import { isConfigured } from './lib/supabaseClient'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/trades', label: 'Trade Geçmişi', icon: TrendingUp },
  { to: '/signals', label: 'Sinyaller', icon: Zap },
  { to: '/strategies', label: 'Stratejiler', icon: BarChart2 },
  { to: '/settings', label: 'Ayarlar', icon: Settings },
]

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>₿ BirKripto</h1>
        <span>Paper Trading Bot</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="live-dot" />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Bot Aktif</span>
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>
          15 dakikada bir çalışıyor
        </div>
      </div>
    </aside>
  )
}

export default function App() {
  const configured = isConfigured()

  return (
    <HashRouter>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          {!configured && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 10,
              padding: '12px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fbbf24', fontSize: '0.85rem' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>
                  <strong>Supabase Anon Key henüz girilmedi:</strong> Canlı bakiye ve trade verilerini görebilmek için Ayarlar sekmesinden Anon Public Key'inizi kaydedebilirsiniz.
                </span>
              </div>
              <NavLink to="/settings" style={{
                flexShrink: 0,
                color: '#fff',
                background: '#d97706',
                padding: '6px 14px',
                borderRadius: 6,
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.8rem'
              }}>
                Anahtarı Gir →
              </NavLink>
            </div>
          )}

          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/trades" element={<Trades />} />
            <Route path="/signals" element={<Signals />} />
            <Route path="/strategies" element={<Strategies />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
