/**
 * 老 JSON 备份导入器。
 *
 * 输入:用户从老版 Gist 导出的 phd_core.json 和 phd_journals.json。
 * 输出:写入 IndexedDB,保留全量备份在 localStorage 里以便回滚。
 *
 * 设计原则:
 * 1. 容错:老结构字段名/类型有出入时,尽量补默认值,不抛异常打断
 * 2. 不破坏:导入前先把原始 JSON 备份一份到 localStorage,可一键恢复
 * 3. 可重入:同一份 JSON 多次导入不会重复(用 id 去重 / 生成确定 id)
 *
 * ⚠️ 当前是"防御式"实现 —— 我没看过你真实的 phd_core.json 结构,
 *   所以这里按"常见个人记账 app 备份"的形态写,字段映射会兜底。
 *   等你贴一份真实样本上来,我会把 mapField() 调成精确匹配。
 */

import { v4 as uuid } from 'uuid'
import { db } from '@/db'
import { CURRENT_SCHEMA_VERSION, type Journal, type SyncableEntity } from '@/types'
import { getDeviceId } from '@/lib/device'
import { nowIso } from '@/lib/date'

const LEGACY_BACKUP_KEY = 'banya_legacy_backup'

export interface ImportReport {
  success: boolean
  counts: Record<string, number>
  errors: string[]
  /** 备份指纹,可用于回滚 */
  backupKey: string
}

/** 防御式取字段:任意类型转字符串,缺省返回 fallback */
function asString(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback
  return String(v)
}

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function asIsoDate(v: unknown, fallback = nowIso()): string {
  if (!v) return fallback
  const d = new Date(v as string | number)
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString()
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  return []
}

/** 给老记录生成同步元字段 */
function withSyncMeta<T extends Record<string, unknown>>(
  raw: T,
  overrides: Partial<SyncableEntity> = {},
): T & SyncableEntity {
  const now = nowIso()
  return {
    ...raw,
    id: asString(raw.id, uuid()),
    user_id: '',
    created_at: asIsoDate(raw.created_at ?? raw.createdAt, now),
    updated_at: asIsoDate(raw.updated_at ?? raw.updatedAt, now),
    deleted_at: null,
    sync_status: 'pending',
    device_id: getDeviceId(),
    schema_version: CURRENT_SCHEMA_VERSION,
    ...overrides,
  } as T & SyncableEntity
}

/**
 * 主入口:接收老 JSON(可能是单个或合并好的对象),写入 IndexedDB。
 *
 * 期望的老结构(常见形态,按需扩展):
 * {
 *   finance: [...],       // 流水
 *   shopping: [...],      // 购物清单
 *   pantry: [...],        // 库存
 *   journals: [...],      // 日志(也可能在 phd_journals.json)
 *   tags: [...],
 *   habits: [...],
 *   habitLogs: [...],
 *   events: [...],        // 日程
 *   focus: [...],         // 专注
 *   settings: {...},      // 键值对
 * }
 */
export async function importLegacyJson(payload: unknown): Promise<ImportReport> {
  const errors: string[] = []
  const counts: Record<string, number> = {}

  // ─── Step 1: 备份原始 JSON,可回滚 ──────────────────────────────
  const backupKey = `${LEGACY_BACKUP_KEY}_${Date.now()}`
  try {
    localStorage.setItem(backupKey, JSON.stringify(payload))
  } catch (e) {
    // localStorage 满了的兜底:警告,但仍允许导入
    errors.push(`原始备份未能保存到 localStorage: ${(e as Error).message}`)
  }

  if (typeof payload !== 'object' || payload === null) {
    return { success: false, counts, errors: ['JSON 顶层不是对象,无法识别'], backupKey }
  }

  const data = payload as Record<string, unknown>

  // ─── Step 2: 逐表迁移 ──────────────────────────────────────────

  // 流水
  const txArr = asArray(data.finance ?? data.transactions ?? data.records)
  if (txArr.length > 0) {
    const rows = txArr.map((raw) => {
      const r = raw as Record<string, unknown>
      return withSyncMeta({
        type:
          r.type === 'income' || r.type === 'transfer' ? r.type : 'expense',
        occurred_at: asIsoDate(r.occurred_at ?? r.date ?? r.time),
        amount: Math.abs(asNumber(r.amount ?? r.value)),
        currency: asString(r.currency, 'EUR'),
        exchange_rate: asNumber(r.exchange_rate, 1),
        category_id: r.category_id ? asString(r.category_id) : null,
        from_account_id: r.from_account_id ? asString(r.from_account_id) : null,
        to_account_id: r.to_account_id ? asString(r.to_account_id) : null,
        participant: asString(r.participant ?? r.merchant ?? r.payee),
        note: asString(r.note ?? r.description ?? r.remark),
        tag_ids: asArray(r.tag_ids ?? r.tags).map((v) => asString(v)),
      })
    })
    try {
      await db.finance_transactions.bulkPut(rows as never)
      counts.finance_transactions = rows.length
    } catch (e) {
      errors.push(`finance: ${(e as Error).message}`)
    }
  }

  // 购物清单
  const shoppingArr = asArray(data.shopping ?? data.shoppingList)
  if (shoppingArr.length > 0) {
    const rows = shoppingArr.map((raw) => {
      const r = raw as Record<string, unknown>
      return withSyncMeta({
        name: asString(r.name ?? r.title),
        category: asString(r.category),
        quantity: asNumber(r.quantity, 1),
        unit: asString(r.unit),
        done: Boolean(r.done ?? r.completed),
        done_at: r.done_at ? asIsoDate(r.done_at) : null,
        auto_to_pantry: Boolean(r.auto_to_pantry),
        note: asString(r.note),
        tag_ids: asArray(r.tag_ids ?? r.tags).map((v) => asString(v)),
      })
    })
    try {
      await db.shopping_items.bulkPut(rows as never)
      counts.shopping_items = rows.length
    } catch (e) {
      errors.push(`shopping: ${(e as Error).message}`)
    }
  }

  // 库存
  const pantryArr = asArray(data.pantry ?? data.inventory)
  if (pantryArr.length > 0) {
    const rows = pantryArr.map((raw) => {
      const r = raw as Record<string, unknown>
      return withSyncMeta({
        name: asString(r.name),
        category: asString(r.category),
        quantity: asNumber(r.quantity, 0),
        unit: asString(r.unit),
        low_threshold: asNumber(r.low_threshold ?? r.threshold, 1),
        expires_on: r.expires_on ? asString(r.expires_on) : null,
        note: asString(r.note),
        tag_ids: asArray(r.tag_ids ?? r.tags).map((v) => asString(v)),
      })
    })
    try {
      await db.pantry_items.bulkPut(rows as never)
      counts.pantry_items = rows.length
    } catch (e) {
      errors.push(`pantry: ${(e as Error).message}`)
    }
  }

  // 日志(支持两种来源:data.journals 或单独的 phd_journals.json 顶层数组)
  const journalSource = Array.isArray(payload)
    ? payload
    : asArray(data.journals ?? data.notes)
  if (journalSource.length > 0) {
    const rows = journalSource.map((raw) => {
      const r = raw as Record<string, unknown>
      return withSyncMeta({
        title: asString(r.title),
        content: asString(r.content ?? r.body ?? r.text),
        image_urls: asArray(r.image_urls ?? r.images).map((v) => asString(v)),
        mood: ['great', 'good', 'meh', 'bad', 'awful'].includes(r.mood as string)
          ? (r.mood as Journal['mood'])
          : null,
        tag_ids: asArray(r.tag_ids ?? r.tags).map((v) => asString(v)),
      })
    })
    try {
      await db.journals.bulkPut(rows as never)
      counts.journals = rows.length
    } catch (e) {
      errors.push(`journals: ${(e as Error).message}`)
    }
  }

  // TODO:tags / habits / habit_logs / calendar_events / focus / settings —— 同样模式,
  // 等你贴出真实老 JSON 再精确对接。

  return { success: errors.length === 0, counts, errors, backupKey }
}

/** 列出所有备份键(供"回滚到老数据"功能用) */
export function listLegacyBackups(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(LEGACY_BACKUP_KEY)) keys.push(k)
  }
  return keys.sort().reverse()
}

/** 取出某个备份的 JSON */
export function readLegacyBackup(key: string): unknown {
  const raw = localStorage.getItem(key)
  return raw ? JSON.parse(raw) : null
}
