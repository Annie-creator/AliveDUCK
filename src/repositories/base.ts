import type { Table } from 'dexie'
import { v4 as uuid } from 'uuid'
import {
  CURRENT_SCHEMA_VERSION,
  type CreateInput,
  type SyncableEntity,
  type UpdateInput,
} from '@/types'
import { getDeviceId } from '@/lib/device'
import { nowIso } from '@/lib/date'
import { getCurrentUserId } from '@/lib/current-user'
import { syncEngine } from '@/lib/sync-engine'

/**
 * 所有业务 Repository 的基类。
 *
 * 设计目标:
 * 1. UI 永远不直接碰 Dexie —— 所有读写经此一层
 * 2. 同步元字段(id / 时间戳 / 软删 / device_id / sync_status)由基类自动维护,
 *    业务代码不用关心
 * 3. Phase 2 接入 Supabase 时,只改这一层(加 push() 即可),UI 一行不动
 *
 * 继承时一般不必重写任何方法 —— 只为各自的领域加业务专属查询(见 finance.ts)。
 */
export abstract class BaseRepository<T extends SyncableEntity> {
  constructor(protected readonly table: Table<T, string>) {}

  /**
   * 当前用户 id。
   * Phase 2 起:由 AuthProvider 注入 setCurrentUserId() 把 supabase auth.uid() 写进来。
   * 未登录时是 'guest_local',让本地数据有一个稳定的"游客身份",
   * 登录后调用 promoteGuestToUser() 一次性把这些行重写为真正的 user_id。
   */
  protected getUserId(): string {
    return getCurrentUserId()
  }

  // ─── 写入操作 ───────────────────────────────────────────────────────

  /** 新建一条记录,自动注入所有同步元字段 */
  async create(input: CreateInput<T>): Promise<T> {
    const now = nowIso()
    const entity = {
      ...input,
      id: uuid(),
      user_id: this.getUserId(),
      created_at: now,
      updated_at: now,
      deleted_at: null,
      sync_status: 'pending',
      device_id: getDeviceId(),
      schema_version: CURRENT_SCHEMA_VERSION,
    } as unknown as T

    await this.table.add(entity)
    syncEngine.scheduleNextPush()
    return entity
  }

  /** 部分字段更新。强制刷新 updated_at;创建/同步元字段不可改 */
  async update(id: string, patch: UpdateInput<T>): Promise<void> {
    const existing = await this.table.get(id)
    if (!existing) throw new Error(`[${this.table.name}] not found: ${id}`)
    if (existing.deleted_at) throw new Error(`[${this.table.name}] already deleted: ${id}`)

    // Dexie v4 的 UpdateSpec<T> 在泛型 T 下推断不出具体键路径,这里只能放宽到 any。
    // 边界是仓库内部,业务侧通过 UpdateInput<T> 已被正确约束。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.table.update(id, {
      ...patch,
      updated_at: nowIso(),
      sync_status: 'pending',
      device_id: getDeviceId(),
    } as any)
    syncEngine.scheduleNextPush()
  }

  /** 软删除。永远保留行(同步、撤销、审计都需要)*/
  async softDelete(id: string): Promise<void> {
    const now = nowIso()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.table.update(id, {
      deleted_at: now,
      updated_at: now,
      sync_status: 'pending',
      device_id: getDeviceId(),
    } as any)
    syncEngine.scheduleNextPush()
  }

  /** 撤销删除 */
  async restore(id: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.table.update(id, {
      deleted_at: null,
      updated_at: nowIso(),
      sync_status: 'pending',
      device_id: getDeviceId(),
    } as any)
    syncEngine.scheduleNextPush()
  }

  /**
   * 物理删除。仅用于:
   * - 老 JSON 导入的回滚
   * - 用户主动"清空全部数据"
   * 业务代码不应直接调用。
   */
  async hardDelete(id: string): Promise<void> {
    await this.table.delete(id)
  }

  /** 批量插入 —— 用于 JSON 导入 / 增量拉取。已存在 id 直接覆盖 */
  async bulkUpsert(entities: T[]): Promise<void> {
    await this.table.bulkPut(entities)
    syncEngine.scheduleNextPush()
  }

  // ─── 读取操作 ───────────────────────────────────────────────────────

  /** 按 id 取(已删除返回 null) */
  async getById(id: string): Promise<T | null> {
    const row = await this.table.get(id)
    if (!row || row.deleted_at) return null
    return row
  }

  /** 列出全部未删除记录 */
  async listAll(): Promise<T[]> {
    return this.table.filter((r) => !r.deleted_at).toArray()
  }

  /** 包含已删除的全量(导出/调试用) */
  async listIncludingDeleted(): Promise<T[]> {
    return this.table.toArray()
  }

  /** 计数(未删除) */
  async count(): Promise<number> {
    return this.table.filter((r) => !r.deleted_at).count()
  }

  // ─── Phase 2/3 占位:同步推送与拉取 ───────────────────────────────

  /**
   * TODO Phase 3:返回所有 sync_status=pending 的记录,推送到 Supabase。
   * 推送成功后调用 markSynced(ids)。
   */
  async listPendingForSync(): Promise<T[]> {
    return this.table.where('id').notEqual('').filter((r) => r.sync_status === 'pending').toArray()
  }

  /** TODO Phase 3:推送成功后批量标记 */
  async markSynced(ids: string[]): Promise<void> {
    await this.table
      .where('id')
      .anyOf(ids)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .modify({ sync_status: 'synced' } as any)
  }
}
