import { useEffect, useState } from 'react'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { db } from '@/db'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { syncEngine, type SyncEngineState } from '@/lib/sync-engine'
import { getCurrentUserId, GUEST_USER_ID } from '@/lib/current-user'
import { getDeviceId } from '@/lib/device'

/**
 * 同步诊断卡。
 *
 * 给 iOS / Android 这种没法接 console 的设备用。
 * 把所有排查同步问题需要看的数字一次性显示出来,带「复制全部」按钮 ——
 * 用户可以直接把诊断 dump 粘贴到任何对话里。
 *
 * 不依赖任何 patch(直接 Dexie 查询 + 内联重复检测),即使老版本也能用。
 */

interface DiagnosticsReport {
  capturedAt: string
  // 配置
  supabaseHost: string
  userId: string
  isLoggedIn: boolean
  deviceId: string
  appUrl: string
  // 同步状态
  syncStatus: SyncEngineState['status']
  pendingCount: number
  lastSyncedAt: string | null
  errorMessage: string | null
  // 各表行数
  tables: Array<{
    name: string
    alive: number
    deleted: number
    pending: number
    synced: number
    guestLocal: number
  }>
  // 重复检测
  dups: {
    settings: number
    categories: number
    finance: number
    financeSamples: string[] // 前几个重复样本(occurred_at + amount + participant)
  }
}

const TABLE_NAMES = [
  'finance_transactions',
  'categories',
  'accounts',
  'budgets',
  'tags',
  'settings',
  'recipes',
  'recipe_items',
  'shopping_items',
  'pantry_items',
  'habits',
  'habit_logs',
  'journals',
  'calendar_events',
  'focus_sessions',
] as const

export function DiagnosticsCard() {
  const [report, setReport] = useState<DiagnosticsReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      setReport(await collectDiagnostics())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function copyAll() {
    if (!report) return
    const text = formatAsText(report)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // iOS 在 http 下 clipboard 会拒,fallback 用旧的 textarea + execCommand
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      } catch {
        // 都失败的话给用户看个 prompt 自己复制
        prompt('复制下面的文本:', text)
      } finally {
        document.body.removeChild(ta)
      }
    }
  }

  if (!report) {
    return (
      <GlassPanel padding="lg" radius="lg">
        <p style={{ color: 'var(--bn-text-tertiary)', fontSize: 'var(--bn-text-sm)' }}>
          诊断信息加载中…
        </p>
      </GlassPanel>
    )
  }

  const hasIssue =
    !report.isLoggedIn ||
    report.errorMessage !== null ||
    report.dups.settings > 0 ||
    report.dups.categories > 0 ||
    report.dups.finance > 0 ||
    report.tables.some((t) => t.guestLocal > 0)

  return (
    <GlassPanel
      padding="lg"
      radius="lg"
      style={{ borderLeft: hasIssue ? '3px solid #E0A75F' : undefined }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          📊 同步诊断
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="刷新"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-all"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
              color: 'var(--bn-text-secondary)',
            }}
          >
            <RefreshCw size={13} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
          </button>
          <Button onClick={() => void copyAll()} variant="glass">
            {copied ? (
              <>
                <Check size={12} strokeWidth={2.5} style={{ marginRight: 4, verticalAlign: -1 }} />
                已复制
              </>
            ) : (
              <>
                <Copy size={12} strokeWidth={2} style={{ marginRight: 4, verticalAlign: -1 }} />
                复制全部
              </>
            )}
          </Button>
        </div>
      </div>

      <p
        className="mb-4 text-xs leading-relaxed"
        style={{ color: 'var(--bn-text-tertiary)' }}
      >
        排查同步问题用。点「复制全部」会复制一份纯文本诊断,直接粘到对话里给我看就行。
      </p>

      {/* —— 同步配置 —— */}
      <Section title="同步配置">
        <Row k="Supabase">
          <span className="bn-mono break-all" style={{ fontSize: 11 }}>
            {report.supabaseHost || '⚠️ 未配置'}
          </span>
        </Row>
        <Row k="登录状态">
          {report.isLoggedIn ? (
            <span style={{ color: 'var(--bn-positive)' }}>✓ 已登录</span>
          ) : (
            <span style={{ color: 'var(--bn-negative)' }}>⚠️ 未登录(游客模式)</span>
          )}
        </Row>
        <Row k="User ID">
          <span className="bn-mono break-all" style={{ fontSize: 10 }}>
            {report.userId}
          </span>
        </Row>
        <Row k="Device ID">
          <span className="bn-mono break-all" style={{ fontSize: 10 }}>
            {report.deviceId}
          </span>
        </Row>
      </Section>

      {/* —— 同步状态 —— */}
      <Section title="同步状态">
        <Row k="状态">
          <SyncStatusPill status={report.syncStatus} />
        </Row>
        <Row k="待推送">
          <span
            className="bn-mono"
            style={{
              color: report.pendingCount > 50
                ? 'var(--bn-negative)'
                : report.pendingCount > 0
                  ? '#E0A75F'
                  : 'var(--bn-text-primary)',
              fontWeight: report.pendingCount > 0 ? 600 : 400,
            }}
          >
            {report.pendingCount} 行
          </span>
        </Row>
        <Row k="上次同步">
          <span style={{ color: 'var(--bn-text-tertiary)', fontSize: 11 }}>
            {report.lastSyncedAt
              ? new Date(report.lastSyncedAt).toLocaleString('zh-CN')
              : '从未'}
          </span>
        </Row>
        {report.errorMessage && (
          <div
            className="mt-1 rounded-lg p-2"
            style={{
              background: 'rgba(220, 80, 60, 0.08)',
              border: '0.5px solid rgba(220, 80, 60, 0.3)',
            }}
          >
            <p style={{ fontSize: 10, color: 'var(--bn-text-tertiary)', marginBottom: 2 }}>
              错误信息
            </p>
            <p
              className="bn-mono break-all"
              style={{ fontSize: 11, color: 'var(--bn-negative)' }}
            >
              {report.errorMessage}
            </p>
          </div>
        )}
      </Section>

      {/* —— 各表数据量 —— */}
      <Section title="数据量">
        <div
          className="overflow-hidden rounded-lg"
          style={{ border: '0.5px solid var(--bn-glass-border)' }}
        >
          <table className="w-full" style={{ fontSize: 11 }}>
            <thead>
              <tr
                style={{
                  background: 'var(--bn-glass)',
                  color: 'var(--bn-text-tertiary)',
                  fontSize: 10,
                  letterSpacing: '0.04em',
                }}
              >
                <th className="px-2 py-1 text-left font-medium">表</th>
                <th className="px-1.5 py-1 text-right font-medium">活</th>
                <th className="px-1.5 py-1 text-right font-medium">删</th>
                <th className="px-1.5 py-1 text-right font-medium">待推</th>
                <th className="px-1.5 py-1 text-right font-medium">guest</th>
              </tr>
            </thead>
            <tbody>
              {report.tables
                .filter((t) => t.alive > 0 || t.deleted > 0 || t.pending > 0 || t.guestLocal > 0)
                .map((t) => (
                  <tr
                    key={t.name}
                    style={{
                      borderTop: '0.5px solid var(--bn-row-border)',
                      color: 'var(--bn-text-secondary)',
                    }}
                  >
                    <td className="px-2 py-1 truncate" style={{ maxWidth: 130 }}>
                      {t.name}
                    </td>
                    <td className="bn-mono px-1.5 py-1 text-right" style={{ color: 'var(--bn-text-primary)' }}>
                      {t.alive}
                    </td>
                    <td className="bn-mono px-1.5 py-1 text-right" style={{ opacity: 0.5 }}>
                      {t.deleted || '·'}
                    </td>
                    <td
                      className="bn-mono px-1.5 py-1 text-right"
                      style={{
                        color: t.pending > 0 ? '#E0A75F' : 'inherit',
                        fontWeight: t.pending > 0 ? 600 : 400,
                      }}
                    >
                      {t.pending || '·'}
                    </td>
                    <td
                      className="bn-mono px-1.5 py-1 text-right"
                      style={{
                        color: t.guestLocal > 0 ? 'var(--bn-negative)' : 'inherit',
                        fontWeight: t.guestLocal > 0 ? 600 : 400,
                      }}
                    >
                      {t.guestLocal || '·'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p
          className="mt-1.5 text-[10px] leading-relaxed"
          style={{ color: 'var(--bn-text-tertiary)' }}
        >
          guest 列 = user_id 是 guest_local 的行(没绑账号,登录时会被收编)。
          如果非零且你已登录,八成是 promoteGuestData 没跑或时机不对。
        </p>
      </Section>

      {/* —— 重复检测 —— */}
      <Section title="重复检测">
        <Row k="Settings 重复">
          <DupValue n={report.dups.settings} />
        </Row>
        <Row k="分类重复">
          <DupValue n={report.dups.categories} />
        </Row>
        <Row k="流水重复(按内容)">
          <DupValue n={report.dups.finance} />
        </Row>
        {report.dups.financeSamples.length > 0 && (
          <div
            className="mt-1 rounded-lg p-2"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
            }}
          >
            <p
              className="mb-1"
              style={{ fontSize: 10, color: 'var(--bn-text-tertiary)' }}
            >
              重复样本(前 {report.dups.financeSamples.length} 条)
            </p>
            {report.dups.financeSamples.map((s, i) => (
              <p
                key={i}
                className="bn-mono break-all"
                style={{ fontSize: 10, color: 'var(--bn-text-secondary)', lineHeight: 1.5 }}
              >
                · {s}
              </p>
            ))}
          </div>
        )}
        <p
          className="mt-1.5 text-[10px] leading-relaxed"
          style={{ color: 'var(--bn-text-tertiary)' }}
        >
          流水按 (发生时间 + 金额 + 商家 + 备注) 判重 —— 完全一样就算重复。
        </p>
      </Section>
    </GlassPanel>
  )
}

/* ─── 数据收集 ─────────────────────────────────────── */

async function collectDiagnostics(): Promise<DiagnosticsReport> {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
  const supabaseUrl = env?.VITE_SUPABASE_URL ?? ''
  const supabaseHost = supabaseUrl
    ? supabaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : ''

  const userId = getCurrentUserId()
  const isLoggedIn = userId !== GUEST_USER_ID

  const syncState = syncEngine.getState()

  // 各表行数
  const tables: DiagnosticsReport['tables'] = []
  for (const name of TABLE_NAMES) {
    const table = (db as unknown as Record<string, { toArray: () => Promise<Array<{
      deleted_at: string | null
      sync_status: string
      user_id: string
    }>> }>)[name]
    if (!table) continue
    try {
      const all = await table.toArray()
      let alive = 0,
        deleted = 0,
        pending = 0,
        synced = 0,
        guestLocal = 0
      for (const r of all) {
        if (r.deleted_at) deleted++
        else alive++
        if (r.sync_status === 'pending') pending++
        if (r.sync_status === 'synced') synced++
        if (r.user_id === GUEST_USER_ID) guestLocal++
      }
      tables.push({ name, alive, deleted, pending, synced, guestLocal })
    } catch {
      // 某张表读不出就跳
    }
  }

  // ── 重复检测(内联,不依赖 dedup-* 模块) ──

  // settings: (user_id, key) 同组 > 1
  const allSettings = await db.settings.filter((s) => !s.deleted_at).toArray()
  const sGroups = new Map<string, number>()
  for (const s of allSettings) {
    const k = `${s.user_id}::${s.key}`
    sGroups.set(k, (sGroups.get(k) ?? 0) + 1)
  }
  let settingsDups = 0
  for (const c of sGroups.values()) {
    if (c > 1) settingsDups += c - 1
  }

  // categories: (user_id, kind, name) 同组 > 1
  const allCats = await db.categories.filter((c) => !c.deleted_at).toArray()
  const cGroups = new Map<string, number>()
  for (const c of allCats) {
    const k = `${c.user_id}::${c.kind}::${c.name}`
    cGroups.set(k, (cGroups.get(k) ?? 0) + 1)
  }
  let catDups = 0
  for (const v of cGroups.values()) {
    if (v > 1) catDups += v - 1
  }

  // finance: 按 (occurred_at, amount, participant, note) 判重
  const allFin = await db.finance_transactions
    .filter((t) => !t.deleted_at)
    .toArray()
  const fSeen = new Map<string, string>()
  let finDups = 0
  const samples: string[] = []
  for (const t of allFin) {
    const k = `${t.occurred_at}|${t.amount.toFixed(2)}|${(t.participant ?? '').trim()}|${(t.note ?? '').trim()}`
    if (fSeen.has(k)) {
      finDups++
      if (samples.length < 3) {
        const dt = new Date(t.occurred_at).toISOString().slice(0, 10)
        const part = t.participant?.trim() || '(无商家)'
        const note = (t.note ?? '').slice(0, 30)
        samples.push(`${dt} ${part} €${t.amount.toFixed(2)} · ${note}`)
      }
    } else {
      fSeen.set(k, t.id)
    }
  }

  return {
    capturedAt: new Date().toISOString(),
    supabaseHost,
    userId,
    isLoggedIn,
    deviceId: getDeviceId(),
    appUrl: window.location.origin + window.location.pathname,
    syncStatus: syncState.status,
    pendingCount: syncState.pendingCount,
    lastSyncedAt: syncState.lastSyncedAt,
    errorMessage: syncState.errorMessage,
    tables,
    dups: {
      settings: settingsDups,
      categories: catDups,
      finance: finDups,
      financeSamples: samples,
    },
  }
}

/* ─── 文本格式化 ─────────────────────────────────────── */

function formatAsText(r: DiagnosticsReport): string {
  const lines: string[] = []
  lines.push('【BANYA-ALIVE 同步诊断】')
  lines.push(`时间: ${new Date(r.capturedAt).toLocaleString('zh-CN')}`)
  lines.push(`URL: ${r.appUrl}`)
  lines.push('')
  lines.push('▌同步配置')
  lines.push(`  Supabase: ${r.supabaseHost || '⚠️ 未配置'}`)
  lines.push(`  登录: ${r.isLoggedIn ? '✓ 已登录' : '⚠️ 未登录(guest)'}`)
  lines.push(`  User ID: ${r.userId}`)
  lines.push(`  Device:  ${r.deviceId}`)
  lines.push('')
  lines.push('▌同步状态')
  lines.push(`  状态: ${r.syncStatus}`)
  lines.push(`  待推送: ${r.pendingCount} 行`)
  lines.push(
    `  上次同步: ${r.lastSyncedAt ? new Date(r.lastSyncedAt).toLocaleString('zh-CN') : '从未'}`,
  )
  if (r.errorMessage) lines.push(`  错误: ${r.errorMessage}`)
  lines.push('')
  lines.push('▌数据量(活/删/待推/guest)')
  for (const t of r.tables) {
    if (t.alive === 0 && t.deleted === 0 && t.pending === 0 && t.guestLocal === 0) continue
    lines.push(`  ${t.name.padEnd(22)} ${t.alive}/${t.deleted}/${t.pending}/${t.guestLocal}`)
  }
  lines.push('')
  lines.push('▌重复检测')
  lines.push(`  Settings 重复: ${r.dups.settings}`)
  lines.push(`  分类重复:      ${r.dups.categories}`)
  lines.push(`  流水重复:      ${r.dups.finance}`)
  if (r.dups.financeSamples.length > 0) {
    lines.push('  流水重复样本:')
    for (const s of r.dups.financeSamples) lines.push(`    · ${s}`)
  }
  return lines.join('\n')
}

/* ─── 小组件 ─────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p
        className="mb-1.5"
        style={{
          fontSize: 10,
          color: 'var(--bn-text-tertiary)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 py-0.5"
      style={{ fontSize: 12 }}
    >
      <span style={{ color: 'var(--bn-text-tertiary)', flexShrink: 0 }}>{k}</span>
      <span className="text-right" style={{ color: 'var(--bn-text-primary)', minWidth: 0 }}>
        {children}
      </span>
    </div>
  )
}

function DupValue({ n }: { n: number }) {
  if (n === 0) {
    return <span style={{ color: 'var(--bn-positive)' }}>✓ 0</span>
  }
  return (
    <span className="bn-mono" style={{ color: 'var(--bn-negative)', fontWeight: 600 }}>
      {n}
    </span>
  )
}

function SyncStatusPill({ status }: { status: SyncEngineState['status'] }) {
  const map: Record<SyncEngineState['status'], { label: string; color: string }> = {
    idle:    { label: '✓ 就绪',  color: 'var(--bn-positive)' },
    pushing: { label: '推送中',  color: '#E0A75F' },
    pulling: { label: '拉取中',  color: '#E0A75F' },
    offline: { label: '离线',    color: 'var(--bn-text-tertiary)' },
    error:   { label: '⚠ 失败',  color: 'var(--bn-negative)' },
  }
  const { label, color } = map[status] ?? { label: status, color: 'var(--bn-text-secondary)' }
  return (
    <span
      className="rounded-full px-2 py-0.5"
      style={{
        fontSize: 11,
        background: 'var(--bn-glass)',
        border: `0.5px solid ${color}`,
        color,
      }}
    >
      {label}
    </span>
  )
}
