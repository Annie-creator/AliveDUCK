/**
 * Sync Engine —— Phase 3 核心。
 *
 * 一个跑在后台的引擎:
 * 1. 写操作触发 → 防抖 800ms → 批量 push 到云
 * 2. 启动时增量 pull,5 分钟周期兜底,Realtime 即时
 * 3. 离线检测,失败指数退避重试
 * 4. 自己推上去回弹的 Realtime 消息按 device_id 去重
 *
 * 设计取舍:
 * - 单例(syncEngine),AuthProvider 控制 start/stop
 * - sync_status 只用 'pending' 和 'synced'(failed/conflict 留给 Phase 5)
 * - 推送失败:不改 sync_status(仍是 pending),靠 retry timer 再试
 * - 冲突:LWW based on updated_at —— 个人 app 够用,字段级 merge 是 Phase 5
 */

import type { Table } from 'dexie'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { db } from '@/db'
import { supabase } from '@/lib/supabase'
import { getDeviceId } from '@/lib/device'
import type { SyncableEntity } from '@/types'

/**
 * 表名 → Dexie table 映射。
 * 顺序按依赖关系:无外键引用的先,有引用的后(虽然 SQL 里没硬约束,语义清晰)。
 */
const TABLES: ReadonlyArray<{ name: string; table: Table<SyncableEntity, string> }> = [
  { name: 'tags', table: db.tags as unknown as Table<SyncableEntity, string> },
  { name: 'accounts', table: db.accounts as unknown as Table<SyncableEntity, string> },
  { name: 'categories', table: db.categories as unknown as Table<SyncableEntity, string> },
  { name: 'recipes', table: db.recipes as unknown as Table<SyncableEntity, string> },
  { name: 'habits', table: db.habits as unknown as Table<SyncableEntity, string> },
  { name: 'settings', table: db.settings as unknown as Table<SyncableEntity, string> },
  {
    name: 'finance_transactions',
    table: db.finance_transactions as unknown as Table<SyncableEntity, string>,
  },
  { name: 'budgets', table: db.budgets as unknown as Table<SyncableEntity, string> },
  {
    name: 'recipe_items',
    table: db.recipe_items as unknown as Table<SyncableEntity, string>,
  },
  { name: 'habit_logs', table: db.habit_logs as unknown as Table<SyncableEntity, string> },
  {
    name: 'calendar_events',
    table: db.calendar_events as unknown as Table<SyncableEntity, string>,
  },
  {
    name: 'focus_sessions',
    table: db.focus_sessions as unknown as Table<SyncableEntity, string>,
  },
  { name: 'journals', table: db.journals as unknown as Table<SyncableEntity, string> },
  {
    name: 'shopping_items',
    table: db.shopping_items as unknown as Table<SyncableEntity, string>,
  },
  {
    name: 'pantry_items',
    table: db.pantry_items as unknown as Table<SyncableEntity, string>,
  },
]

const PUSH_DEBOUNCE_MS = 800
const PUSH_BATCH_SIZE = 50
const PULL_FALLBACK_INTERVAL_MS = 5 * 60 * 1000 // 5 分钟兜底
const RETRY_INITIAL_MS = 2_000
const RETRY_MAX_MS = 5 * 60 * 1000 // 5 分钟封顶

const lastSyncedKey = (table: string) => `bn_last_synced_${table}`

export type SyncStatus = 'idle' | 'pushing' | 'pulling' | 'offline' | 'error'

export interface SyncEngineState {
  status: SyncStatus
  /** 待推送行数(所有表合计)*/
  pendingCount: number
  /** 上次成功同步时间 */
  lastSyncedAt: string | null
  /** 当前错误消息 */
  errorMessage: string | null
}

type SyncListener = (state: SyncEngineState) => void

class SyncEngine {
  private listeners = new Set<SyncListener>()
  private state: SyncEngineState = {
    status: 'idle',
    pendingCount: 0,
    lastSyncedAt: null,
    errorMessage: null,
  }

  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private fallbackPullTimer: ReturnType<typeof setInterval> | null = null
  private retryDelayMs = RETRY_INITIAL_MS
  private channel: RealtimeChannel | null = null
  private running = false
  private currentUid: string | null = null

  // ── 公共 API ────────────────────────────────────────────────────

  /** AuthProvider 在用户登录后调用 */
  async start(uid: string): Promise<void> {
    if (this.running && this.currentUid === uid) return
    if (this.running) await this.stop()

    this.running = true
    this.currentUid = uid

    // 1) 先一次全量增量 pull(新设备登录会拉满)
    await this.runPull()

    // 2) 启动周期兜底 pull
    this.fallbackPullTimer = setInterval(() => {
      if (this.running) this.runPull().catch(() => {})
    }, PULL_FALLBACK_INTERVAL_MS)

    // 3) 订阅 Realtime
    this.subscribeRealtime(uid)

    // 4) 监听网络变化
    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)

    // 5) 推一次本地 pending(可能是上次会话留下的)
    this.scheduleNextPush(0)

    this.update({ status: navigator.onLine ? 'idle' : 'offline' })
  }

  async stop(): Promise<void> {
    if (!this.running) return
    this.running = false

    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = null
    if (this.fallbackPullTimer) clearInterval(this.fallbackPullTimer)
    this.fallbackPullTimer = null

    this.unsubscribeRealtime()
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)

    this.currentUid = null
    this.retryDelayMs = RETRY_INITIAL_MS
    this.update({ status: 'idle', pendingCount: 0, errorMessage: null })
  }

  /**
   * 任何写操作后调用 —— 触发防抖 push。
   * 业务代码不必关心细节,这里会:
   * - 800ms 内的多次调用合并成一次推送
   * - 没登录就不推(BaseRepository 仍然会调,但 runPush 自己 noop)
   */
  scheduleNextPush(delayMs: number = PUSH_DEBOUNCE_MS): void {
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(() => {
      void this.runPush()
    }, delayMs)
  }

  /** 用户主动点"立即同步" */
  async forceSyncNow(): Promise<void> {
    if (!this.running) return
    await this.runPush()
    await this.runPull()
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  getState(): SyncEngineState {
    return this.state
  }

  // ── 内部 ──────────────────────────────────────────────────────

  private update(patch: Partial<SyncEngineState>): void {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l(this.state))
  }

  private handleOnline = (): void => {
    this.retryDelayMs = RETRY_INITIAL_MS
    this.update({ status: 'idle', errorMessage: null })
    this.scheduleNextPush(0)
    void this.runPull()
  }

  private handleOffline = (): void => {
    this.update({ status: 'offline' })
  }

  // ── Push ─────────────────────────────────────────────────────

  private async runPush(): Promise<void> {
    if (!this.running || !this.currentUid || !supabase) return
    if (!navigator.onLine) {
      this.update({ status: 'offline' })
      return
    }

    this.update({ status: 'pushing', errorMessage: null })

    let firstError: string | null = null

    for (const { name, table } of TABLES) {
      try {
        const pending = await table
          .filter(
            (r) => r.sync_status === 'pending' && r.user_id === this.currentUid,
          )
          .toArray()
        if (pending.length === 0) continue

        for (let i = 0; i < pending.length; i += PUSH_BATCH_SIZE) {
          const chunk = pending.slice(i, i + PUSH_BATCH_SIZE)

          // 剥掉纯本地的 sync_status 字段 —— 云端 schema 里没这一列。
          // sync_status 是"对当前设备而言这行是否已推送"的本地视角,
          // 不应该跨设备共享。
          const stripped = chunk.map((row) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { sync_status: _drop, ...rest } = row
            return rest
          })

          const { error } = await supabase
            .from(name)
            .upsert(stripped, { onConflict: 'id' })
          if (error) throw new Error(error.message)

          // 标记 synced(只标我们刚成功推的)
          await table
            .where('id')
            .anyOf(chunk.map((r) => r.id))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .modify({ sync_status: 'synced' } as any)
        }
      } catch (e) {
        const msg = `${name}: ${(e as Error).message}`
        if (!firstError) firstError = msg
        // 注意:失败的不改 sync_status,仍然是 pending,下次重试自然会拿到
      }
    }

    const newPending = await this.countPending()

    if (firstError) {
      this.update({
        status: 'error',
        pendingCount: newPending,
        errorMessage: firstError,
      })
      // 退避重试
      const delay = this.retryDelayMs
      this.retryDelayMs = Math.min(this.retryDelayMs * 2, RETRY_MAX_MS)
      this.pushTimer = setTimeout(() => {
        void this.runPush()
      }, delay)
    } else {
      this.retryDelayMs = RETRY_INITIAL_MS
      this.update({
        status: 'idle',
        pendingCount: newPending,
        lastSyncedAt: new Date().toISOString(),
        errorMessage: null,
      })
    }
  }

  private async countPending(): Promise<number> {
    if (!this.currentUid) return 0
    let total = 0
    for (const { table } of TABLES) {
      total += await table
        .filter(
          (r) => r.sync_status === 'pending' && r.user_id === this.currentUid,
        )
        .count()
    }
    return total
  }

  // ── Pull ─────────────────────────────────────────────────────

  private async runPull(): Promise<void> {
    if (!this.running || !this.currentUid || !supabase) return
    if (!navigator.onLine) {
      this.update({ status: 'offline' })
      return
    }

    this.update({ status: 'pulling' })
    const myDeviceId = getDeviceId()

    for (const { name, table } of TABLES) {
      try {
        const lastSynced =
          localStorage.getItem(lastSyncedKey(name)) ?? '1970-01-01T00:00:00.000Z'

        const { data, error } = await supabase
          .from(name)
          .select('*')
          .eq('user_id', this.currentUid)
          .gt('updated_at', lastSynced)
          .order('updated_at', { ascending: true })
          .limit(1000)

        if (error) throw new Error(error.message)
        if (!data || data.length === 0) continue

        const toApply: SyncableEntity[] = []
        for (const remote of data as SyncableEntity[]) {
          const local = await table.get(remote.id)

          if (!local) {
            // 本地没有,直接装
            toApply.push({ ...remote, sync_status: 'synced' })
          } else if (local.device_id === myDeviceId && local.sync_status === 'synced') {
            // 自己刚推上去的回弹,跳过
            continue
          } else if (remote.updated_at > local.updated_at) {
            // 远端更新 → LWW 覆盖
            toApply.push({ ...remote, sync_status: 'synced' })
          }
          // else 本地更新或一致 → 不动
        }

        if (toApply.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await table.bulkPut(toApply as any)
        }

        // 推进 cursor
        const maxUpdated = (data as SyncableEntity[]).reduce(
          (max, r) => (r.updated_at > max ? r.updated_at : max),
          lastSynced,
        )
        localStorage.setItem(lastSyncedKey(name), maxUpdated)
      } catch (e) {
        // pull 单表失败不致命,记日志继续
        // eslint-disable-next-line no-console
        console.warn(`[sync] pull ${name} failed:`, e)
      }
    }

    this.update({
      status: 'idle',
      lastSyncedAt: new Date().toISOString(),
    })
  }

  // ── Realtime ────────────────────────────────────────────────

  private subscribeRealtime(uid: string): void {
    if (!supabase) return

    /**
     * 单 channel 监听所有表 —— 比每张表一个 channel 省连接配额。
     * Supabase 免费层 200 并发连接,这样 1 个用户 1 个 channel,够用。
     */
    let ch = supabase.channel(`bn_realtime_${uid}`)
    for (const { name, table } of TABLES) {
      ch = ch.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: name,
          filter: `user_id=eq.${uid}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (payload: any) => {
          if (!this.running) return
          // DELETE 物理删除我们不处理(我们用软删,UPDATE 就够了)
          if (payload?.eventType === 'DELETE') return

          const newRow = payload?.new as SyncableEntity | undefined
          if (!newRow || !newRow.id) return

          await this.applyRealtimeRow(table, newRow)
        },
      )
    }
    this.channel = ch.subscribe()
  }

  private unsubscribeRealtime(): void {
    if (this.channel && supabase) {
      void supabase.removeChannel(this.channel)
    }
    this.channel = null
  }

  private async applyRealtimeRow(
    table: Table<SyncableEntity, string>,
    remote: SyncableEntity,
  ): Promise<void> {
    const myDeviceId = getDeviceId()
    const local = await table.get(remote.id)

    if (local) {
      // 自己回弹 → 跳过
      if (local.device_id === myDeviceId && remote.updated_at <= local.updated_at) {
        return
      }
      // 本地更新 → 跳过(等下次 push)
      if (local.updated_at > remote.updated_at) return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await table.put({ ...remote, sync_status: 'synced' } as any)

    // 推进该表 cursor 到这行的 updated_at,避免下次 pull 又拉回来
    const cursor = localStorage.getItem(lastSyncedKey(this.tableNameFor(table) ?? '')) ?? ''
    if (remote.updated_at > cursor) {
      const tname = this.tableNameFor(table)
      if (tname) localStorage.setItem(lastSyncedKey(tname), remote.updated_at)
    }
  }

  private tableNameFor(t: Table<SyncableEntity, string>): string | null {
    return TABLES.find((x) => x.table === t)?.name ?? null
  }
}

export const syncEngine = new SyncEngine()
