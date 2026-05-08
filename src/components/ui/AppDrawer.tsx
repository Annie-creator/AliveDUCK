import { AnimatePresence, motion, useMotionValue, type PanInfo } from 'framer-motion'
import { NavLink, useLocation, Link } from 'react-router-dom'
import { useEffect, type ReactNode } from 'react'
import {
  Home,
  Wallet,
  Calendar,
  Timer,
  ChefHat,
  BookHeart,
  Settings as SettingsIcon,
  X,
  LogOut,
} from 'lucide-react'
import { useTheme } from '@/themes'
import { THEME_META, THEME_ORDER } from '@/themes/themes'
import { useAuth } from '@/auth/AuthProvider'
import { SyncBadge } from '@/components/SyncBadge'

interface NavMeta {
  to: string
  label: string
  icon: ReactNode
}

const NAV_ITEMS: NavMeta[] = [
  { to: '/', label: '首页', icon: <Home size={18} strokeWidth={1.8} /> },
  { to: '/money', label: '财务', icon: <Wallet size={18} strokeWidth={1.8} /> },
  { to: '/calendar', label: '日历', icon: <Calendar size={18} strokeWidth={1.8} /> },
  { to: '/focus', label: '专注', icon: <Timer size={18} strokeWidth={1.8} /> },
  { to: '/kitchen', label: '厨房', icon: <ChefHat size={18} strokeWidth={1.8} /> },
  { to: '/journal', label: '日记', icon: <BookHeart size={18} strokeWidth={1.8} /> },
  { to: '/settings', label: '设置', icon: <SettingsIcon size={18} strokeWidth={1.8} /> },
]

interface AppDrawerProps {
  open: boolean
  onClose: () => void
}

/**
 * 移动端侧拉抽屉。
 *
 * 设计决策：
 *  - 从右侧滑入（拇指可达）
 *  - 280px 宽，拖拽 > 30% 自动关闭
 *  - 顶部用户身份区（头像 + 邮箱）
 *  - 中部 7 个菜单（图标 + 文字）
 *  - 底部主题快切 5 个圆点（Annie 想要的"小彩蛋"）
 *  - 最底同步状态 + 版本号
 */
export function AppDrawer({ open, onClose }: AppDrawerProps) {
  const location = useLocation()
  const x = useMotionValue(0)

  // 切页面自动关
  useEffect(() => {
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // 锁定 body 滚动
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  function handleDragEnd(_: unknown, info: PanInfo) {
    // 向右拖动超过 90px 或速度 > 500 → 关闭
    if (info.offset.x > 90 || info.velocity.x > 500) {
      onClose()
    } else {
      void x.set(0)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0, 0, 0, 0.45)' }}
          />

          {/* 抽屉本体 */}
          <motion.aside
            initial={{ x: 280 }}
            animate={{ x: 0 }}
            exit={{ x: 280 }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag="x"
            dragConstraints={{ left: 0, right: 280 }}
            dragElastic={0.05}
            onDragEnd={handleDragEnd}
            style={{ x }}
            className="fixed right-0 top-0 z-50 flex h-full w-[280px] flex-col"
          >
            {/* 整体玻璃背景 */}
            <div
              className="flex h-full flex-col"
              style={{
                background: 'var(--bn-glass-strong)',
                backdropFilter: 'blur(28px) saturate(170%)',
                WebkitBackdropFilter: 'blur(28px) saturate(170%)',
                borderLeft: '0.5px solid var(--bn-glass-border)',
                boxShadow: '-12px 0 40px rgba(0,0,0,0.18)',
              }}
            >
              <DrawerHeader onClose={onClose} />
              <DrawerNav />
              <div style={{ flex: 1 }} />
              <DrawerThemeQuickSwitch />
              <DrawerFooter />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

/* ── 头部：用户身份 + 关闭按钮 ────────────────────── */
function DrawerHeader({ onClose }: { onClose: () => void }) {
  const { user, isConfigured, signOut } = useAuth()
  const email = user?.email ?? ''
  const initial = email.slice(0, 1).toUpperCase() || 'U'

  return (
    <div
      className="flex items-center gap-3 px-5 pb-4 pt-5"
      style={{ borderBottom: '0.5px solid var(--bn-row-border)' }}
    >
      {/* 头像 */}
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{
          background: user ? 'var(--bn-accent)' : 'var(--bn-glass)',
          color: user ? 'var(--bn-button-fg)' : 'var(--bn-text-secondary)',
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          border: user ? 'none' : '0.5px dashed var(--bn-glass-border)',
        }}
      >
        {user ? initial : '🦆'}
      </div>

      <div className="min-w-0 flex-1">
        <div
          className="truncate"
          style={{
            fontFamily: 'var(--bn-font-mono)',
            fontSize: 'var(--bn-text-md)',
            fontWeight: 700,
            color: 'var(--bn-text-primary)',
            letterSpacing: '-0.025em',
          }}
        >
          AliveDUCK
        </div>
        {user ? (
          <div
            className="truncate"
            style={{
              fontSize: 'var(--bn-text-xs)',
              color: 'var(--bn-text-tertiary)',
              marginTop: 1,
            }}
          >
            {email}
          </div>
        ) : isConfigured ? (
          <Link
            to="/login"
            onClick={onClose}
            className="inline-block rounded-md transition-colors"
            style={{
              fontSize: 'var(--bn-text-xs)',
              color: 'var(--bn-accent)',
              marginTop: 2,
              fontWeight: 500,
            }}
          >
            点击登录 / 注册 →
          </Link>
        ) : (
          <div
            style={{
              fontSize: 'var(--bn-text-xs)',
              color: 'var(--bn-text-tertiary)',
              marginTop: 1,
            }}
          >
            本地模式
          </div>
        )}
      </div>

      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        style={{ color: 'var(--bn-text-tertiary)' }}
      >
        <X size={18} strokeWidth={2} />
      </button>

      {/* 退出登录（小,藏在头像区右下） */}
      {user && (
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="退出登录"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: 'var(--bn-text-tertiary)' }}
          title="退出登录"
        >
          <LogOut size={16} strokeWidth={1.8} />
        </button>
      )}
    </div>
  )
}

/* ── 主菜单 ──────────────────────────────────────── */
function DrawerNav() {
  return (
    <nav className="flex flex-col gap-0.5 px-3 pt-3">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
          style={({ isActive }) => ({
            background: isActive ? 'var(--bn-nav-active-bg)' : 'transparent',
            boxShadow: isActive ? 'var(--bn-nav-active-shadow)' : 'none',
            color: isActive ? 'var(--bn-text-primary)' : 'var(--bn-text-secondary)',
            fontWeight: isActive ? 500 : 400,
          })}
        >
          <span className="shrink-0">{item.icon}</span>
          <span style={{ fontSize: 'var(--bn-text-md)', letterSpacing: '-0.01em' }}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

/* ── 主题快切：5 个色块 ───────────────────────────── */
function DrawerThemeQuickSwitch() {
  const { themeId, setTheme } = useTheme()

  return (
    <div
      className="px-5 py-4"
      style={{ borderTop: '0.5px solid var(--bn-row-border)' }}
    >
      <div
        className="mb-2.5 uppercase"
        style={{
          fontSize: 'var(--bn-text-xs)',
          color: 'var(--bn-text-tertiary)',
          letterSpacing: '0.08em',
          fontWeight: 500,
        }}
      >
        主题
      </div>
      <div className="flex items-center gap-2.5">
        {THEME_ORDER.map((id) => {
          const meta = THEME_META[id]
          const active = themeId === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              aria-label={meta.name}
              title={meta.name}
              className="relative h-8 w-8 rounded-full transition-transform active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${meta.swatches[0]} 0%, ${meta.swatches[1]} 50%, ${meta.swatches[2]} 100%)`,
                border: active
                  ? '2px solid var(--bn-text-primary)'
                  : '1px solid var(--bn-glass-border)',
                boxShadow: active ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

/* ── 底部：同步徽章 + 版本 ───────────────────────── */
function DrawerFooter() {
  return (
    <div
      className="flex items-center justify-between px-5 pb-5 pt-3"
      style={{ borderTop: '0.5px solid var(--bn-row-border)' }}
    >
      <SyncBadge />
      <span
        className="bn-mono"
        style={{ fontSize: 'var(--bn-text-xs)', color: 'var(--bn-text-tertiary)' }}
      >
        v0.1 · Phase 6
      </span>
    </div>
  )
}
