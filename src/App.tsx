import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { ThemeProvider, useTheme } from '@/themes'
import { AuthProvider } from '@/auth/AuthProvider'
import { SyncProvider } from '@/lib/sync-context'
import { DashboardPage } from '@/pages/DashboardPage'
import { FinancePage } from '@/pages/FinancePage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { MadridSkyline } from '@/components/MadridSkyline'
import { SyncBadge } from '@/components/SyncBadge'
import { cn } from '@/lib/cn'

const NAV: { to: string; label: string }[] = [
  { to: '/', label: '首页' },
  { to: '/finance', label: '记账' },
  { to: '/analytics', label: '分析' },
  { to: '/settings', label: '设置' },
]

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'rounded-xl px-3.5 py-2 text-sm transition-all duration-200',
          isActive ? 'font-medium' : 'hover:bg-white/10',
        )
      }
      style={({ isActive }) => ({
        color: isActive ? 'var(--bn-text-primary)' : 'var(--bn-text-secondary)',
        background: isActive ? 'var(--bn-nav-active-bg)' : 'transparent',
        boxShadow: isActive ? 'var(--bn-nav-active-shadow)' : 'none',
        letterSpacing: '-0.01em',
      })}
    >
      {label}
    </NavLink>
  )
}

function Shell() {
  const { theme } = useTheme()

  return (
    <>
      {/* 大气背景层:三个 blob,固定在视口,被毛玻璃模糊出光感 */}
      <div className="bn-atmosphere">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      {/* 马德里主题独占的天际线 */}
      {theme.hasSkyline && <MadridSkyline />}

      {/* 顶部玻璃栏 */}
      <header
        className="bn-glass sticky top-0 z-20"
        style={{
          borderBottom: '0.5px solid var(--bn-glass-border)',
          borderTop: 'none',
          borderLeft: 'none',
          borderRight: 'none',
        }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg font-medium"
              style={{
                background: 'var(--bn-accent)',
                color: 'var(--bn-button-fg)',
                fontSize: '14px',
                letterSpacing: '-0.02em',
              }}
            >
              b
            </div>
            <span
              className="font-medium tracking-tight"
              style={{
                fontSize: '16px',
                color: 'var(--bn-text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              板鸭留子 Alive
            </span>
          </div>

          <nav className="flex items-center gap-1.5">
            {NAV.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
            <div className="ml-2">
              <SyncBadge />
            </div>
          </nav>
        </div>
      </header>

      {/* 主内容 */}
      <main className="relative z-10 mx-auto max-w-3xl px-5 py-7">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <footer
        className="relative z-10 mx-auto max-w-3xl px-5 pb-10 pt-6 text-center text-xs"
        style={{ color: 'var(--bn-text-tertiary)' }}
      >
        Phase 4 · 多维度分析 · Excel 导出 · 自动同步
      </footer>
    </>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SyncProvider>
          <BrowserRouter>
            <Shell />
          </BrowserRouter>
        </SyncProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
