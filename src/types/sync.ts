/**
 * 同步元字段 —— 所有业务实体的基类。
 *
 * 这套字段是 local-first 架构的"基础设施":
 * - 让本地 IndexedDB 和云端 Supabase 用同一份 schema
 * - 让冲突解决基于 updated_at 仲裁
 * - 让删除走软删,可同步、可撤销
 * - 让 schema 演进时不破坏老用户数据
 *
 * Phase 1:只用前 5 个字段(本地 CRUD 即可工作)。
 * Phase 2+:sync_status、device_id、schema_version 投入使用。
 */

export type SyncStatus = 'synced' | 'pending' | 'failed' | 'conflict'

export interface SyncableEntity {
  /** 客户端生成的 UUID,跨设备唯一,主键 */
  id: string

  /** 用户隔离锚点。Phase 1 留空字符串,Phase 2 接 auth.uid() 后回填 */
  user_id: string

  /** 创建时间(ISO8601)。一旦写入永不修改 */
  created_at: string

  /** 最近修改时间(ISO8601)。每次 update 必须刷新 —— 冲突解决依据 */
  updated_at: string

  /** 软删除时间戳。null 表示未删 */
  deleted_at: string | null

  /** 同步状态。Phase 1 始终为 'pending' 直到接入云端 */
  sync_status: SyncStatus

  /** 哪台设备最后改的。用于冲突排查与日志 */
  device_id: string

  /** 数据模型版本号。未来加字段时,migration 函数靠它升级老记录 */
  schema_version: number
}

/**
 * 创建新实体时,业务代码只需提供这部分字段;
 * 同步元字段由 BaseRepository 自动填好。
 */
export type CreateInput<T extends SyncableEntity> = Omit<
  T,
  | 'id'
  | 'user_id'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
  | 'sync_status'
  | 'device_id'
  | 'schema_version'
>

/**
 * 更新时不允许改 id / created_at / 同步元字段(由 repo 接管)。
 */
export type UpdateInput<T extends SyncableEntity> = Partial<CreateInput<T>>

/** 当前 schema 版本号。每次破坏性改动 +1,并在 db/migrations.ts 写迁移函数 */
export const CURRENT_SCHEMA_VERSION = 1
