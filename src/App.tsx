import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ThemeProvider, useTheme } from '@/themes'
import { AuthProvider } from '@/auth/AuthProvider'
import { UserMenu } from '@/auth/UserMenu'
import { SyncProvider } from '@/lib/sync-context'
import { DashboardPage } from '@/pages/DashboardPage'
import { MoneyPage } from '@/pages/MoneyPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { FocusPage } from '@/pages/FocusPage'
import { KitchenPage } from '@/pages/KitchenPage'
import { JournalPage } from '@/pages/JournalPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { MadridSkyline } from '@/components/MadridSkyline'
import { SyncBadge } from '@/components/SyncBadge'
import { cn } from '@/lib/cn'

interface NavMeta {
  to: string
  label: string
  primary?: boolean
}

const NAV: NavMeta[] = [
  { to: '/', label: '首页', primary: true },
  { to: '/money', label: '财务', primary: true },
  { to: '/calendar', label: '日历', primary: true },
  { to: '/focus', label: '专注', primary: true },
  { to: '/kitchen', label: '厨房', primary: true },
  { to: '/journal', label: '日记' },
  { to: '/settings', label: '设置' },
]

function NavItem({ to, label, onClick }: NavMeta & { onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'shrink-0 rounded-xl px-2.5 py-1.5 text-[13px] transition-all duration-200',
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

/** 桌面端的更多菜单(放习惯/日记/食谱/厨房/设置)*/
function MoreMenu() {
  const [open, setOpen] = useState(false)
  const moreItems = NAV.filter((n) => !n.primary)

  // 点外部关
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    setTimeout(() => document.addEventListener('click', close, { once: true }), 0)
    return () => document.removeEventListener('click', close)
  }, [open])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        className="rounded-xl px-2.5 py-1.5 text-[13px] transition-all hover:bg-white/10"
        style={{ color: 'var(--bn-text-secondary)' }}
      >
        更多 ▾
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 min-w-[120px] overflow-hidden rounded-xl py-1 shadow-lg"
          style={{
            background: 'var(--bn-glass-strong)',
            border: '0.5px solid var(--bn-glass-border)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            zIndex: 100,
          }}
        >
          {moreItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-[13px] transition-colors hover:bg-white/10"
              style={({ isActive }) => ({
                color: isActive ? 'var(--bn-text-primary)' : 'var(--bn-text-secondary)',
                fontWeight: isActive ? 500 : 400,
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

/** 移动端汉堡菜单 */
function HamburgerMenu() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // 切页面后自动关
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg p-1.5 hover:bg-white/10"
        style={{ color: 'var(--bn-text-secondary)' }}
        aria-label="菜单"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setOpen(false)}
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          <div
            className="absolute right-0 top-0 h-full w-[200px] p-4"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bn-bg)',
              borderLeft: '0.5px solid var(--bn-glass-border)',
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mb-4 text-sm"
              style={{ color: 'var(--bn-text-tertiary)' }}
            >
              ✕ 关闭
            </button>
            <nav className="flex flex-col gap-0.5">
              {NAV.map((n) => (
                <NavItem key={n.to} {...n} />
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  )
}

function Shell() {
  const { theme } = useTheme()
  const primaryItems = NAV.filter((n) => n.primary)
  const hasMoreItems = NAV.some((n) => !n.primary)

  return (
    <>
      <div className="bn-atmosphere">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      {theme.hasSkyline && <MadridSkyline />}

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

          {/* 桌面导航(>= md):主项 + 更多下拉 */}
          <nav className="hidden md:flex items-center gap-0.5">
            {primaryItems.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
            {hasMoreItems && <MoreMenu />}
            <div className="ml-2 flex shrink-0 items-center gap-2">
              <SyncBadge />
              <UserMenu />
            </div>
          </nav>

          {/* 移动端导航(< md):汉堡 */}
          <div className="flex items-center gap-2 md:hidden">
            <SyncBadge />
            <UserMenu />
            <HamburgerMenu />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-5 py-7">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/money" element={<MoneyPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/focus" element={<FocusPage />} />
          <Route path="/kitchen" element={<KitchenPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </main>

      <footer
        className="relative z-10 mx-auto max-w-3xl px-5 pb-10 pt-6 text-center text-xs"
        style={{ color: 'var(--bn-text-tertiary)' }}
      >
        Phase 6 · 架构整合 · 等待视觉重做
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
