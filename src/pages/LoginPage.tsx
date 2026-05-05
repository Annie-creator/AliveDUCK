import { Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { AuthPanel } from '@/auth/AuthPanel'
import { GlassPanel } from '@/components/ui/GlassPanel'

export function LoginPage() {
  const { user } = useAuth()

  // 已登录就跳回首页
  if (user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: 'var(--bn-text-secondary)' }}>
          ACCOUNT
        </p>
        <h1 className="text-[30px] leading-[1.15]"
          style={{
            color: 'var(--bn-text-primary)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
          }}>
          登录
          <span className="ml-2"
            style={{
              color: 'var(--bn-text-tertiary)',
              fontWeight: 300,
              letterSpacing: '-0.02em',
            }}>
            或注册一个账号
          </span>
        </h1>
        <p className="mt-2 text-xs leading-relaxed"
          style={{ color: 'var(--bn-text-secondary)' }}>
          注册后,你的数据会同步到云端,跨设备一致。
          不登录也能用,所有数据都本地保存,但只能在这台设备看。
        </p>
      </div>

      <AuthPanel />

      <GlassPanel padding="md" radius="lg">
        <p className="text-xs leading-relaxed"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          ⚠ <strong>登录失败</strong>?这是最常见的两个原因:<br />
          · 邮箱验证还没点 → 去邮箱找 Supabase 的验证邮件,或让 Claude 帮你关掉验证<br />
          · Supabase 的 Site URL / Redirect URLs 没配 → 见 README
        </p>
      </GlassPanel>
    </div>
  )
}
