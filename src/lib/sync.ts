/**
 * 登录过渡:把游客时代积累的本地数据"过户"到当前账号。
 *
 * 时机:用户登录后、sync engine 启动前。
 * 操作:把所有 user_id='guest_local' 的行改成 auth.uid(),
 *       sync_status 自动保持 pending → engine 启动后会推上去。
 *
 * Phase 2 的 uploadAll/downloadAll 已被自动同步引擎取代,这里不再需要。
 */

import type { Table } from 'dexie'
import { db } from '@/db'
import { GUEST_USER_ID } from '@/lib/current-user'
import type { SyncableEntity } from '@/types'

const ALL_TABLES: Table<SyncableEntity, string>[] = [
  db.accounts,
  db.categories,
  db.finance_transactions,
  db.budgets,
  db.tags,
  db.calendar_events,
  db.focus_sessions,
  db.journals,
  db.recipes,
  db.recipe_items,
  db.shopping_items,
  db.pantry_items,
  db.habits,
  db.habit_logs,
  db.settings,
] as unknown as Table<SyncableEntity, string>[]

export async function promoteGuestData(uid: string): Promise<{ promoted: number }> {
  let total = 0
  for (const table of ALL_TABLES) {
    try {
      const guests = await table.where('user_id' as never).equals(GUEST_USER_ID).toArray()
      if (guests.length === 0) continue
      const updated = guests.map((r) => ({
        ...r,
        user_id: uid,
        sync_status: 'pending' as const,
      }))
      await table.bulkPut(updated)
      total += guests.length
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[promote] ${table.name} failed:`, e)
    }
  }
  return { promoted: total }
}
