import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, TrendingUp, Zap, BarChart2, Settings } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Trades'
import Signals from './pages/Signals'
import Strategies from './pages/Strategies'
import SettingsPage from './pages/SettingsPage'

const BASE = '/birkripto'

const navItems = [
  { to: `${BASE}/`, label: 'Dashboard', icon: LayoutDashboard },
  { to: `${BASE}/trades`, label: 'Trade Geçmişi', icon: TrendingUp },
  { to: `${BASE}/signals`, label: 'Sinyaller', icon: Zap },
  { to: `${BASE}/strategies`, label: 'Stratejiler', icon: BarChart2 },
  { to: `${BASE}/settings`, label: 'Ayarlar', icon: Settings },
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
          <NavLink key={to} to={to} end={to === `${BASE}/`}
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
  return (
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path={`${BASE}/`} element={<Dashboard />} />
            <Route path={`${BASE}/trades`} element={<Trades />} />
            <Route path={`${BASE}/signals`} element={<Signals />} />
            <Route path={`${BASE}/strategies`} element={<Strategies />} />
            <Route path={`${BASE}/settings`} element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
