import { useAuth } from '@/auth/AuthProvider'
import { useSync } from '@/lib/sync-context'

/**
 * 顶部右侧的迷你同步状态指示器。
 *
 * 状态映射:
 * - 未配置 Supabase  → 不显示
 * - 游客(未登录)   → 灰点 + "本机模式"
 * - idle              → 绿点 + 邮箱前缀(已同步)
 * - pushing/pulling   → 蓝点 + 旋转动画 + "同步中"
 * - offline           → 黄点 + "离线 · N 待推"
 * - error             → 红点 + "同步失败 · 点击重试"
 *
 * 点击:触发 forceSyncNow() 立即同步一次。
 */
export function SyncBadge() {
  const { user, isConfigured } = useAuth()
  const { state, forceSyncNow } = useSync()

  if (!isConfigured) return null

  const signedIn = user !== null

  // 派生显示属性
  let dotColor = 'var(--bn-text-tertiary)'
  let label = '本机模式'
  let pulse = false
  let title = '游客模式 · 数据仅在本机'

  if (signedIn) {
    const emailPrefix = user.email?.split('@')[0] ?? '已登录'
    if (state.status === 'pushing' || state.status === 'pulling') {
      dotColor = 'var(--bn-cat-2)' // 蓝调
      label = '同步中'
      pulse = true
      title = state.status === 'pushing' ? '正在推送本地变更…' : '正在拉取云端更新…'
    } else if (state.status === 'offline') {
      dotColor = '#E0A75F' // amber-ish, 跨主题都可见
      label = state.pendingCount > 0 ? `离线 · ${state.pendingCount} 待推` : '离线'
      title = '当前离线,联网后自动同步'
    } else if (state.status === 'error') {
      dotColor = 'var(--bn-negative)'
      label = '同步失败'
      title = state.errorMessage ?? '点击重试'
    } else {
      // idle
      dotColor = 'var(--bn-positive)'
      label = state.pendingCount > 0 ? `${state.pendingCount} 待推` : emailPrefix
      title = state.lastSyncedAt
        ? `已同步 · ${formatRelative(state.lastSyncedAt)}`
        : '已登录 ' + emailPrefix
    }
  }

  return (
    <button
      type="button"
      onClick={signedIn ? () => void forceSyncNow() : undefined}
      title={title}
      className="flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] transition-colors hover:opacity-80"
      style={{
        background: 'var(--bn-glass)',
        border: '0.5px solid var(--bn-glass-border)',
        color: 'var(--bn-text-secondary)',
        cursor: signedIn ? 'pointer' : 'default',
      }}
    >
      <span
        className={pulse ? 'animate-pulse' : ''}
        style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: dotColor,
        }}
      />
      <span className="bn-mono max-w-[100px] truncate">{label}</span>
    </button>
  )
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso)
  const sec = Math.floor(diffMs / 1000)
  if (sec < 5) return '刚刚'
  if (sec < 60) return `${sec} 秒前`
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
