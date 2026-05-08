/**
 * 清理重复 settings 行。
 *
 * 历史 bug:`SettingRepository.setValue` 用 `where('key').first()` 检查存在,
 * 既没按 user_id 过滤、也没原子化。在以下场景会留下脏数据:
 * - 游客 → 登录(promoteGuestData 把 guest_local 转 user_id,而本地可能已有同 key 行)
 * - StrictMode 双跑 / 并发 setValue
 * - 多设备 pull 把云端的同 key 不同 id 行拉下来
 *
 * 表现:Supabase 上 `(user_id, key)` 唯一约束触发 → push 失败,SyncBadge 显示
 * `settings: duplicate key value violates unique constraint "settings_user_id_key_key"`。
 *
 * 修复策略:每组同 (user_id, key) 选一个 keeper,把别的软删。
 * keeper 选择优先级:
 *   1. 已 synced(已和云端绑定)的优先,避免推送时撞云端的 id
 *   2. 同状态时 created_at 早的优先(稳定性)
 * keeper 的 value 用所有候选里 updated_at 最大的那个 —— 用户最近一次修改的值。
 */

import { db } from '@/db'
import { settingsRepo } from '@/repositories'
import type { Setting } from '@/types'

export interface SettingsDedupReport {
  groupsFound: number
  duplicatesRemoved: number
  /** 哪些 key 被合并了 —— UI 给用户看一眼 */
  affectedKeys: string[]
}

/** 快速检测,只读不改 —— UI 决定是否显示清理按钮 */
export async function countDuplicateSettings(): Promise<number> {
  const rows = await db.settings.filter((r) => !r.deleted_at).toArray()
  const groups = groupByUserKey(rows)
  let extras = 0
  for (const arr of groups.values()) {
    if (arr.length > 1) extras += arr.length - 1
  }
  return extras
}

export async function dedupSettings(): Promise<SettingsDedupReport> {
  const rows = await db.settings.filter((r) => !r.deleted_at).toArray()
  const groups = groupByUserKey(rows)

  let groupsFound = 0
  let duplicatesRemoved = 0
  const affectedKeys: string[] = []

  for (const [, arr] of groups) {
    if (arr.length <= 1) continue
    groupsFound++

    // 选 keeper —— synced 优先,然后 created_at 早的优先
    arr.sort(compareForKeeper)
    const keeper = arr[0]!

    // value 取所有候选里 updated_at 最大的那个 —— 用户最近一次设的值
    let latest = keeper
    for (const r of arr) {
      if (r.updated_at > latest.updated_at) latest = r
    }

    // 把 keeper 的 value 更新成最新的(走 repo,会触发同步)
    if (latest.id !== keeper.id || JSON.stringify(latest.value) !== JSON.stringify(keeper.value)) {
      await settingsRepo.update(keeper.id, { value: latest.value } as Partial<Setting>)
    }

    // 软删别的
    for (let i = 1; i < arr.length; i++) {
      await settingsRepo.softDelete(arr[i]!.id)
      duplicatesRemoved++
    }

    affectedKeys.push(keeper.key)
  }

  return { groupsFound, duplicatesRemoved, affectedKeys }
}

function compareForKeeper(a: Setting, b: Setting): number {
  // synced 永远优先 —— 它的 id 已经和云端绑定,留它能避免下次 push 撞唯一约束
  const aSynced = a.sync_status === 'synced'
  const bSynced = b.sync_status === 'synced'
  if (aSynced && !bSynced) return -1
  if (!aSynced && bSynced) return 1
  // 同状态 → created_at 早的优先(决定性,可重入)
  return a.created_at.localeCompare(b.created_at)
}

function groupByUserKey(rows: Setting[]): Map<string, Setting[]> {
  const m = new Map<string, Setting[]>()
  for (const r of rows) {
    const k = `${r.user_id}::${r.key}`
    const arr = m.get(k) ?? []
    arr.push(r)
    m.set(k, arr)
  }
  return m
}
