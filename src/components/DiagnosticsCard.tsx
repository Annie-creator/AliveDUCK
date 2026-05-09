import { useEffect, useState } from 'react'
import { Copy, Check, RefreshCw, Cloud, Download } from 'lucide-react'
import { db } from '@/db'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { syncEngine, type SyncEngineState } from '@/lib/sync-engine'
import { getCurrentUserId, GUEST_USER_ID, setCurrentUserId } from '@/lib/current-user'
import { getDeviceId } from '@/lib/device'
import { supabase } from '@/lib/supabase'

/**
 * 同步诊断卡 v3。
 *
 * 在 v2 基础上加:
 * 1. **云端 alive 行数**(单独一栏,跟总行数并列) —— 看 dedup 后云端状态
 * 2. **强制全量重拉**按钮 —— 清掉所有同步 cursor,从 1970-01-01 开始重 pull,
 *    用于 cursor 已经 advance 过头、错过了某些 keeper 行的场景
 */

interface DiagnosticsReport {
  capturedAt: string
  supabaseHost: string
  supabaseConfigured: boolean
  localUserId: string
  localIsLoggedIn: boolean
  deviceId: string
  appUrl: string
  serverUserId: string | null
  serverEmail: string | null
  serverError: string | null
  authMismatch: boolean
  syncStatus: SyncEngineState['status']
  pendingCount: number
  lastSyncedAt: string | null
  errorMessage: string | null
  tables: Array<{
    name: string
    alive: number
    deleted: number
    pending: number
    synced: number
    guestLocal: number
  }>
  dups: {
    settings: number
    categories: number
    finance: number
    financeSamples: string[]
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

  const [cloudFinTotal, setCloudFinTotal] = useState<number | null>(null)
  const [cloudFinAlive, setCloudFinAlive] = useState<number | null>(null)
  const [cloudFinError, setCloudFinError] = useState<string | null>(null)
  const [cloudFinLoading, setCloudFinLoading] = useState(false)

  const [rePullBusy, setRePullBusy] = useState(false)
  const [rePullMsg, setRePullMsg] = useState<string | null>(null)

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
    const text = formatAsText(report, cloudFinTotal, cloudFinAlive, cloudFinError)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
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
        prompt('复制下面的文本:', text)
      } finally {
        document.body.removeChild(ta)
      }
    }
  }

  async function fetchCloudFinanceCount() {
    if (!supabase) {
      setCloudFinError('Supabase 未配置')
      return
    }
    setCloudFinLoading(true)
    setCloudFinError(null)
    try {
      // 总行数
      const totalRes = await supabase
        .from('finance_transactions')
        .select('*', { count: 'exact', head: true })
      // alive 行数(deleted_at is null)
      const aliveRes = await supabase
        .from('finance_transactions')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)

      if (totalRes.error) {
        setCloudFinError(totalRes.error.message)
      } else if (aliveRes.error) {
        setCloudFinError(aliveRes.error.message)
      } else {
        setCloudFinTotal(totalRes.count ?? 0)
        setCloudFinAlive(aliveRes.count ?? 0)
      }
    } catch (e) {
      setCloudFinError((e as Error).message)
    } finally {
      setCloudFinLoading(false)
    }
  }

  async function forceResyncAuth() {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    setCurrentUserId(data.session?.user.id ?? null)
    await refresh()
  }

  /**
   * 强制全量重拉。
   * 清掉所有 bn_last_synced_* cursor,然后触发同步。
   * 用于 cursor 已经被 advance 过的设备错过了某些 keeper 行的场景。
   */
  async function forceFullRePull() {
    if (
      !confirm(
        '会清掉所有同步 cursor,从 1970-01-01 重新 pull 全部数据。无损操作,只会下载,不会改本地写过的东西。\n\n用于"本地数据 < 云端数据"的场景。继续?',
      )
    )
      return
    setRePullBusy(true)
    setRePullMsg('清 cursor…')
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('bn_last_synced_')) keysToRemove.push(k)
      }
      for (const k of keysToRemove) localStorage.removeItem(k)
      setRePullMsg(`清掉 ${keysToRemove.length} 个 cursor,开始 pull…`)

      await syncEngine.forceSyncNow()
      // 给点时间让 pull 跑(forceSyncNow 是 fire-and-await,但 pull 有多张表)
      await new Promise((r) => setTimeout(r, 1500))

      await refresh()
      setRePullMsg('✓ 完成,看上面行数有没有变')
      setTimeout(() => setRePullMsg(null), 6000)
    } catch (e) {
      setRePullMsg(`✗ 失败:${(e as Error).message}`)
    } finally {
      setRePullBusy(false)
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
    !report.localIsLoggedIn ||
    report.authMismatch ||
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
        排查同步问题用。点「复制全部」会把所有信息(含云端探针)打成一段文本。
      </p>

      {report.authMismatch && (
        <div
          className="mb-4 rounded-xl p-3"
          style={{
            background: 'rgba(220, 80, 60, 0.08)',
            border: '0.5px solid rgba(220, 80, 60, 0.4)',
          }}
        >
          <p className="mb-1.5 text-xs font-medium" style={{ color: 'var(--bn-negative)' }}>
            ⚠️ 本地认知 ≠ 服务器认知
          </p>
          <p className="mb-2 text-xs leading-relaxed" style={{ color: 'var(--bn-text-secondary)' }}>
            UI 已登录但同步引擎用的是 guest。点下面强制把真 uid 写进去。装了
            current-user.ts 的 eager-init 修复后这个钮一般用不到。
          </p>
          <Button onClick={() => void forceResyncAuth()} variant="glass">
            🔧 强制同步 auth 状态
          </Button>
        </div>
      )}

      <Section title="同步配置 / 认证">
        <Row k="Supabase">
          <span className="bn-mono break-all" style={{ fontSize: 11 }}>
            {report.supabaseHost || '⚠️ 未配置'}
          </span>
        </Row>
        <Row k="本地认知 uid">
          <span className="bn-mono break-all" style={{ fontSize: 10 }}>
            {report.localUserId === GUEST_USER_ID ? (
              <span style={{ color: 'var(--bn-negative)' }}>guest_local</span>
            ) : (
              report.localUserId
            )}
          </span>
        </Row>
        <Row k="服务器认知 uid">
          {report.serverError ? (
            <span style={{ color: 'var(--bn-negative)', fontSize: 11 }}>
              ✗ {report.serverError}
            </span>
          ) : report.serverUserId ? (
            <span className="bn-mono break-all" style={{ fontSize: 10, color: 'var(--bn-positive)' }}>
              ✓ {report.serverUserId}
            </span>
          ) : (
            <span style={{ color: 'var(--bn-text-tertiary)', fontSize: 11 }}>
              (无 session)
            </span>
          )}
        </Row>
        {report.serverEmail && (
          <Row k="登录邮箱">
            <span className="break-all" style={{ fontSize: 11 }}>
              {report.serverEmail}
            </span>
          </Row>
        )}
        <Row k="Device ID">
          <span className="bn-mono break-all" style={{ fontSize: 10 }}>
            {report.deviceId}
          </span>
        </Row>
      </Section>

      <Section title="云端探针(直连 Supabase)">
        <div
          className="rounded-xl p-3"
          style={{ background: 'var(--bn-glass)', border: '0.5px solid var(--bn-glass-border)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span style={{ fontSize: 12, color: 'var(--bn-text-secondary)' }}>
              云端 finance_transactions
            </span>
            <Button
              onClick={() => void fetchCloudFinanceCount()}
              disabled={cloudFinLoading || !report.supabaseConfigured}
              variant="glass"
            >
              <Cloud
                size={12}
                strokeWidth={2}
                style={{ marginRight: 4, verticalAlign: -1 }}
              />
              {cloudFinLoading ? '查询中…' : '查云端'}
            </Button>
          </div>
          {(cloudFinAlive !== null || cloudFinTotal !== null) && (
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <div>
                <span style={{ color: 'var(--bn-text-tertiary)', fontSize: 11 }}>alive</span>
                <p
                  className="bn-mono"
                  style={{
                    color: 'var(--bn-text-primary)',
                    fontWeight: 600,
                    fontSize: 18,
                  }}
                >
                  {cloudFinAlive ?? '—'}
                </p>
              </div>
              <div>
                <span style={{ color: 'var(--bn-text-tertiary)', fontSize: 11 }}>
                  总(含 deleted)
                </span>
                <p
                  className="bn-mono"
                  style={{
                    color: 'var(--bn-text-secondary)',
                    fontWeight: 500,
                    fontSize: 18,
                  }}
                >
                  {cloudFinTotal ?? '—'}
                </p>
              </div>
            </div>
          )}
          {cloudFinError && (
            <p
              className="bn-mono mt-2 break-all text-xs"
              style={{ color: 'var(--bn-negative)' }}
            >
              ✗ {cloudFinError}
            </p>
          )}
        </div>
        <p
          className="mt-1.5 text-[10px] leading-relaxed"
          style={{ color: 'var(--bn-text-tertiary)' }}
        >
          alive = deleted_at 为 null 的行数。<strong>两端这个数应当一致</strong>;不一致就说明本地没拉全。
        </p>
      </Section>

      <Section title="同步动作">
        <div
          className="rounded-xl p-3"
          style={{ background: 'var(--bn-glass)', border: '0.5px solid var(--bn-glass-border)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--bn-text-primary)',
                  fontWeight: 500,
                }}
              >
                强制全量重拉
              </p>
              <p
                style={{
                  fontSize: 10,
                  color: 'var(--bn-text-tertiary)',
                  marginTop: 2,
                  lineHeight: 1.5,
                }}
              >
                清掉所有 bn_last_synced_* cursor,再触发一次 pull。当本地行数远小于云端时用。
              </p>
            </div>
            <Button onClick={() => void forceFullRePull()} disabled={rePullBusy} variant="glass">
              <Download
                size={12}
                strokeWidth={2}
                style={{ marginRight: 4, verticalAlign: -1 }}
              />
              {rePullBusy ? '处理中…' : '强制全量重拉'}
            </Button>
          </div>
          {rePullMsg && (
            <p
              className="mt-2"
              style={{ fontSize: 11, color: 'var(--bn-text-secondary)' }}
            >
              {rePullMsg}
            </p>
          )}
        </div>
      </Section>

      <Section title="同步状态">
        <Row k="状态">
          <SyncStatusPill status={report.syncStatus} />
        </Row>
        <Row k="待推送">
          <span
            className="bn-mono"
            style={{
              color:
                report.pendingCount > 50
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

      <Section title="本地数据量">
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
      </Section>

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
            <p className="mb-1" style={{ fontSize: 10, color: 'var(--bn-text-tertiary)' }}>
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
      </Section>
    </GlassPanel>
  )
}

async function collectDiagnostics(): Promise<DiagnosticsReport> {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
  const supabaseUrl = env?.VITE_SUPABASE_URL ?? ''
  const supabaseHost = supabaseUrl
    ? supabaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : ''

  const localUserId = getCurrentUserId()
  const localIsLoggedIn = localUserId !== GUEST_USER_ID
  const supabaseConfigured = supabase !== null

  let serverUserId: string | null = null
  let serverEmail: string | null = null
  let serverError: string | null = null
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        serverError = error.message
      } else if (data.session?.user) {
        serverUserId = data.session.user.id
        serverEmail = data.session.user.email ?? null
      }
    } catch (e) {
      serverError = (e as Error).message
    }
  }

  const authMismatch = serverUserId !== null && localUserId !== serverUserId

  const syncState = syncEngine.getState()

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
      // skip unreadable tables
    }
  }

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

  const allFin = await db.finance_transactions.filter((t) => !t.deleted_at).toArray()
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
    supabaseConfigured,
    localUserId,
    localIsLoggedIn,
    deviceId: getDeviceId(),
    appUrl: window.location.origin + window.location.pathname,
    serverUserId,
    serverEmail,
    serverError,
    authMismatch,
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

function formatAsText(
  r: DiagnosticsReport,
  cloudFinTotal: number | null,
  cloudFinAlive: number | null,
  cloudFinError: string | null,
): string {
  const lines: string[] = []
  lines.push('【BANYA-ALIVE 同步诊断 v3】')
  lines.push(`时间: ${new Date(r.capturedAt).toLocaleString('zh-CN')}`)
  lines.push(`URL: ${r.appUrl}`)
  lines.push('')
  lines.push('▌认证')
  lines.push(`  Supabase: ${r.supabaseHost || '⚠️ 未配置'}`)
  lines.push(`  本地 uid:  ${r.localUserId}`)
  lines.push(
    `  服务器 uid: ${r.serverError ? '✗ ' + r.serverError : (r.serverUserId ?? '(无 session)')}`,
  )
  if (r.serverEmail) lines.push(`  邮箱:      ${r.serverEmail}`)
  lines.push(`  Device:    ${r.deviceId}`)
  if (r.authMismatch) lines.push('  ⚠️ 本地认知 ≠ 服务器认知!')
  lines.push('')
  lines.push('▌云端探针(直连 SQL)')
  if (cloudFinAlive !== null || cloudFinTotal !== null) {
    lines.push(`  finance_transactions alive: ${cloudFinAlive ?? '—'}`)
    lines.push(`  finance_transactions 总:    ${cloudFinTotal ?? '—'}`)
  } else if (cloudFinError) {
    lines.push(`  ✗ ${cloudFinError}`)
  } else {
    lines.push('  (未点查云端按钮)')
  }
  lines.push('')
  lines.push('▌同步状态')
  lines.push(`  状态: ${r.syncStatus}`)
  lines.push(`  待推送: ${r.pendingCount} 行`)
  lines.push(
    `  上次同步: ${r.lastSyncedAt ? new Date(r.lastSyncedAt).toLocaleString('zh-CN') : '从未'}`,
  )
  if (r.errorMessage) lines.push(`  错误: ${r.errorMessage}`)
  lines.push('')
  lines.push('▌本地数据量(活/删/待推/guest)')
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
    lines.push('  样本:')
    for (const s of r.dups.financeSamples) lines.push(`    · ${s}`)
  }
  return lines.join('\n')
}

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
    <div className="flex items-baseline justify-between gap-3 py-0.5" style={{ fontSize: 12 }}>
      <span style={{ color: 'var(--bn-text-tertiary)', flexShrink: 0 }}>{k}</span>
      <span className="text-right" style={{ color: 'var(--bn-text-primary)', minWidth: 0 }}>
        {children}
      </span>
    </div>
  )
}

function DupValue({ n }: { n: number }) {
  if (n === 0) return <span style={{ color: 'var(--bn-positive)' }}>✓ 0</span>
  return (
    <span className="bn-mono" style={{ color: 'var(--bn-negative)', fontWeight: 600 }}>
      {n}
    </span>
  )
}

function SyncStatusPill({ status }: { status: SyncEngineState['status'] }) {
  const map: Record<SyncEngineState['status'], { label: string; color: string }> = {
    idle:    { label: '✓ 就绪', color: 'var(--bn-positive)' },
    pushing: { label: '推送中', color: '#E0A75F' },
    pulling: { label: '拉取中', color: '#E0A75F' },
    offline: { label: '离线',   color: 'var(--bn-text-tertiary)' },
    error:   { label: '⚠ 失败', color: 'var(--bn-negative)' },
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
