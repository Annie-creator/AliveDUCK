import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Link } from 'react-router-dom'

/**
 * 顶部右上角的用户头像菜单。
 *
 * 未登录:显示 "登录" 按钮(跳转 /settings → 登录卡片)
 * 已登录:头像圆 + 下拉菜单(显示邮箱 + 退出登录 + 进设置)
 */
export function UserMenu() {
  const { user, isConfigured, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 点外部关
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  // 未配置 Supabase(本地模式)— 不显示菜单,只显示一个静默标签
  if (!isConfigured) {
    return (
      <span
        className="text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--bn-text-tertiary)' }}
      >
        本地
      </span>
    )
  }

  // 未登录
  if (!user) {
    return (
      <Link
        to="/login"
        className="rounded-lg px-2.5 py-1 text-[12px] transition-all"
        style={{
          background: 'var(--bn-glass)',
          color: 'var(--bn-text-secondary)',
          border: '0.5px solid var(--bn-glass-border)',
        }}
      >
        登录
      </Link>
    )
  }

  // 已登录
  const initial = (user.email ?? '?').slice(0, 1).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-medium transition-all hover:opacity-85"
        style={{
          background: 'var(--bn-accent)',
          color: 'var(--bn-button-fg)',
        }}
        aria-label="用户菜单"
      >
        {initial}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 min-w-[200px] overflow-hidden rounded-xl py-1 shadow-lg"
          style={{
            background: 'var(--bn-glass-strong)',
            border: '0.5px solid var(--bn-glass-border)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            zIndex: 100,
          }}
        >
          <div className="px-3 py-2" style={{ borderBottom: '0.5px solid var(--bn-row-border)' }}>
            <p className="text-[10px] uppercase tracking-wider"
              style={{ color: 'var(--bn-text-tertiary)' }}>
              当前账号
            </p>
            <p className="mt-0.5 truncate text-xs"
              style={{ color: 'var(--bn-text-primary)' }}>
              {user.email}
            </p>
          </div>

          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-[13px] transition-colors hover:bg-white/10"
            style={{ color: 'var(--bn-text-secondary)' }}
          >
            ⚙ 设置
          </Link>

          <button
            type="button"
            onClick={async () => {
              setOpen(false)
              await signOut()
            }}
            className="block w-full px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-white/10"
            style={{ color: 'var(--bn-negative)' }}
          >
            ↪ 退出登录
          </button>
        </div>
      )}
    </div>
  )
}
