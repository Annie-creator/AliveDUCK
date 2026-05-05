import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useSync } from '@/lib/sync-context'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Input } from '@/components/ui/Input'

type Mode = 'sign_in' | 'sign_up'

export function AuthPanel() {
  const { user, isConfigured, loading, signInWithPassword, signUpWithPassword, signOut } =
    useAuth()
  const [mode, setMode] = useState<Mode>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (!isConfigured) {
    return (
      <GlassPanel padding="lg" radius="lg">
        <h2 className="mb-1 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          云端账号未配置
        </h2>
        <p
          className="mb-3 text-xs leading-relaxed"
          style={{ color: 'var(--bn-text-secondary)' }}
        >
          要启用跨设备自动同步,需要你的 Supabase 项目地址和 anon key。请按{' '}
          <span className="bn-mono">supabase/README.md</span> 创建免费项目,把值填到{' '}
          <span className="bn-mono">.env.local</span> 里,重启 dev server。
        </p>
        <p className="text-xs" style={{ color: 'var(--bn-text-tertiary)' }}>
          没配置也完全没关系 — 当前是游客模式,所有数据保存在本机。
        </p>
      </GlassPanel>
    )
  }

  if (loading) {
    return (
      <GlassPanel padding="lg" radius="lg">
        <p className="text-sm" style={{ color: 'var(--bn-text-secondary)' }}>
          正在恢复登录状态…
        </p>
      </GlassPanel>
    )
  }

  if (user) return <SignedInPanel signOut={signOut} email={user.email ?? ''} />

  async function handleSubmit() {
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      const fn = mode === 'sign_in' ? signInWithPassword : signUpWithPassword
      const { error: e } = await fn(email, password)
      if (e) {
        setError(e)
        return
      }
      if (mode === 'sign_up') {
        setInfo('注册成功。去邮箱点验证链接,然后回来登录。')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassPanel padding="lg" radius="lg">
      <h2 className="mb-1 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
        {mode === 'sign_in' ? '登录账号' : '注册账号'}
      </h2>
      <p className="mb-4 text-xs" style={{ color: 'var(--bn-text-secondary)' }}>
        登录后数据自动在所有设备间同步,无需任何手动操作。
      </p>

      <div className="space-y-2.5">
        <Input
          type="email"
          autoComplete="email"
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          type="password"
          autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
          placeholder="密码 (至少 6 位)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && (
        <p className="mt-3 text-xs" style={{ color: 'var(--bn-negative)' }}>
          {error}
        </p>
      )}
      {info && (
        <p className="mt-3 text-xs" style={{ color: 'var(--bn-positive)' }}>
          {info}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={handleSubmit} disabled={busy}>
          {busy ? '处理中…' : mode === 'sign_in' ? '登录' : '注册'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in')
            setError(null)
            setInfo(null)
          }}
        >
          {mode === 'sign_in' ? '没账号 · 去注册' : '已有账号 · 去登录'}
        </Button>
      </div>
    </GlassPanel>
  )
}

function SignedInPanel({
  signOut,
  email,
}: {
  signOut: () => Promise<void>
  email: string
}) {
  const { state, forceSyncNow } = useSync()

  return (
    <GlassPanel padding="lg" radius="lg">
      <h2 className="mb-1 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
        已登录 · 自动同步开启
      </h2>
      <p className="mb-4 text-xs" style={{ color: 'var(--bn-text-secondary)' }}>
        当前账号:<span className="bn-mono">{email}</span>
      </p>

      <div className="grid grid-cols-3 gap-2">
        <StatItem label="状态" value={renderStatus(state.status)} />
        <StatItem label="待推" value={`${state.pendingCount}`} />
        <StatItem
          label="上次同步"
          value={state.lastSyncedAt ? formatTime(state.lastSyncedAt) : '—'}
        />
      </div>

      {state.errorMessage && (
        <p
          className="mt-3 break-all rounded-lg px-3 py-2 text-xs"
          style={{
            color: 'var(--bn-negative)',
            background: 'var(--bn-glass)',
            border: '0.5px solid var(--bn-glass-border)',
          }}
        >
          {state.errorMessage}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="glass" onClick={() => void forceSyncNow()}>
          立即同步
        </Button>
        <Button variant="ghost" size="sm" onClick={signOut}>
          退出登录
        </Button>
      </div>
    </GlassPanel>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg p-2"
      style={{
        background: 'var(--bn-glass)',
        border: '0.5px solid var(--bn-glass-border)',
      }}
    >
      <p
        className="text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--bn-text-tertiary)' }}
      >
        {label}
      </p>
      <p
        className="bn-mono mt-0.5 text-sm font-medium"
        style={{ color: 'var(--bn-text-primary)' }}
      >
        {value}
      </p>
    </div>
  )
}

function renderStatus(s: string): string {
  switch (s) {
    case 'idle':
      return '已同步'
    case 'pushing':
      return '推送中…'
    case 'pulling':
      return '拉取中…'
    case 'offline':
      return '离线'
    case 'error':
      return '失败'
    default:
      return s
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
