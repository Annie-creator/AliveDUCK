import { useState, useEffect, type ReactNode } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import {
  Home,
  Wallet,
  Calendar,
  Timer,
  ChefHat,
  BookHeart,
  Settings as SettingsIcon,
  Menu,
} from 'lucide-react'
import { ThemeProvider, useTheme } from '@/themes'
import { AuthProvider } from '@/auth/AuthProvider'
import { UserMenu } from '@/auth/UserMenu'
import { SyncProvider } from '@/lib/sync-context'
import { useFontScale, useAppIcon } from '@/lib/preferences'
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
import { AppDrawer } from '@/components/ui/AppDrawer'
import { WelcomeSplash } from '@/components/onboarding/WelcomeSplash'
import { CelebrateHost } from '@/components/onboarding/Celebrate'
import { cn } from '@/lib/cn'

interface NavMeta {
  to: string
  label: string
  icon: ReactNode
}

const NAV: NavMeta[] = [
  { to: '/', label: '首页', icon: <Home size={15} strokeWidth={1.8} /> },
  { to: '/money', label: '财务', icon: <Wallet size={15} strokeWidth={1.8} /> },
  { to: '/calendar', label: '日历', icon: <Calendar size={15} strokeWidth={1.8} /> },
  { to: '/focus', label: '专注', icon: <Timer size={15} strokeWidth={1.8} /> },
  { to: '/kitchen', label: '厨房', icon: <ChefHat size={15} strokeWidth={1.8} /> },
  { to: '/journal', label: '日记', icon: <BookHeart size={15} strokeWidth={1.8} /> },
  { to: '/settings', label: '设置', icon: <SettingsIcon size={15} strokeWidth={1.8} /> },
]

/* ── 桌面端 nav 项 ──────────────────────────────────── */
function NavItem({ to, label, icon }: NavMeta) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 transition-all duration-200',
          isActive ? 'font-medium' : 'hover:bg-white/10',
        )
      }
      style={({ isActive }) => ({
        color: isActive ? 'var(--bn-text-primary)' : 'var(--bn-text-secondary)',
        background: isActive ? 'var(--bn-nav-active-bg)' : 'transparent',
        boxShadow: isActive ? 'var(--bn-nav-active-shadow)' : 'none',
        fontSize: 'var(--bn-text-sm)',
        letterSpacing: '-0.005em',
      })}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </NavLink>
  )
}

function Shell() {
  const { theme } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [fontScale] = useFontScale()
  const appIcon = useAppIcon()

  // 把字体档位写到 <html> 的 data 属性,index.css 里读 [data-font-scale="..."]
  useEffect(() => {
    document.documentElement.setAttribute('data-font-scale', fontScale)
  }, [fontScale])

  // 动态 favicon —— 跟 App 图标偏好走
  // 优先级:用户上传的 dataUrl > emoji 渲染成 SVG > 默认 /icon.svg
  useEffect(() => {
    const link = document.getElementById('bn-favicon') as HTMLLinkElement | null
    const apple = document.getElementById('bn-apple-icon') as HTMLLinkElement | null
    if (!link && !apple) return

    let href: string
    if (appIcon.dataUrl) {
      href = appIcon.dataUrl
    } else if (appIcon.emoji && appIcon.emoji !== '🦆') {
      // 把 emoji 渲染到 SVG 上,跟默认图标背景一致
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFB07A"/><stop offset="55%" stop-color="#FF8A95"/><stop offset="100%" stop-color="#E78AB8"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(#g)"/><text x="50" y="58" font-size="60" text-anchor="middle" dominant-baseline="middle">${appIcon.emoji}</text></svg>`
      href = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
    } else {
      // 默认鸭子 SVG
      href = '/icon.svg'
    }
    if (link) link.href = href
    if (apple) apple.href = href
  }, [appIcon.emoji, appIcon.dataUrl])

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
          {/* 品牌区 */}
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{
                background: 'var(--bn-accent)',
                color: 'var(--bn-button-fg)',
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '-0.02em',
              }}
            >
              🦆
            </div>
            <span
              style={{
                fontFamily: 'var(--bn-font-mono)',
                fontSize: 'var(--bn-text-md)',
                fontWeight: 700,
                color: 'var(--bn-text-primary)',
                letterSpacing: '-0.025em',
              }}
            >
              AliveDUCK
            </span>
          </div>

          {/* 桌面端导航：7 项全部平铺 + 图标 */}
          <nav className="hidden md:flex items-center gap-0.5">
            {NAV.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
            <div className="ml-2 flex shrink-0 items-center gap-2">
              <SyncBadge />
              <UserMenu />
            </div>
          </nav>

          {/* 移动端：汉堡按钮 */}
          <div className="flex items-center gap-2 md:hidden">
            <SyncBadge />
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="打开菜单"
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: 'var(--bn-text-primary)' }}
            >
              <Menu size={20} strokeWidth={1.8} />
            </button>
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

      {/* 移动端抽屉 */}
      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* 启动欢迎页（每天首次或距上次 >6h 才显示） */}
      <WelcomeSplash />

      {/* 完成动画全局挂载点（fireCelebrate 调用即可触发） */}
      <CelebrateHost />
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
