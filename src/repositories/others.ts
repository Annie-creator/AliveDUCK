import { db } from '@/db'
import type {
  CalendarEvent,
  FocusSession,
  Habit,
  HabitLog,
  Journal,
  PantryItem,
  Recipe,
  RecipeItem,
  Setting,
  ShoppingItem,
  Tag,
} from '@/types'
import { BaseRepository } from './base'

/**
 * 这一组仓库目前只继承 BaseRepository,后续按需加业务方法。
 * 模板很短:`class XxxRepo extends BaseRepository<X> {}` 即可上线。
 */

class TagRepository extends BaseRepository<Tag> {}

class CalendarEventRepository extends BaseRepository<CalendarEvent> {
  async listInRange(startIso: string, endIso: string): Promise<CalendarEvent[]> {
    // 任何与 [start, end) 有交集的事件都算命中
    return db.calendar_events
      .filter(
        (e) =>
          !e.deleted_at &&
          e.end_at >= startIso &&
          e.start_at < endIso,
      )
      .sortBy('start_at')
  }
}

class FocusSessionRepository extends BaseRepository<FocusSession> {
  /** 取最近 N 条,倒序 */
  async listRecent(limit = 50): Promise<FocusSession[]> {
    return db.focus_sessions
      .filter((s) => !s.deleted_at)
      .reverse()
      .sortBy('started_at')
      .then((arr) => arr.slice(0, limit))
  }
}

class JournalRepository extends BaseRepository<Journal> {
  async listRecent(limit = 50): Promise<Journal[]> {
    return db.journals
      .filter((j) => !j.deleted_at)
      .reverse()
      .sortBy('created_at')
      .then((arr) => arr.slice(0, limit))
  }
}

class RecipeRepository extends BaseRepository<Recipe> {}
class RecipeItemRepository extends BaseRepository<RecipeItem> {
  async listByRecipe(recipeId: string): Promise<RecipeItem[]> {
    return db.recipe_items
      .where('recipe_id')
      .equals(recipeId)
      .filter((i) => !i.deleted_at)
      .toArray()
  }
}

class ShoppingItemRepository extends BaseRepository<ShoppingItem> {
  async listPending(): Promise<ShoppingItem[]> {
    return db.shopping_items.filter((s) => !s.deleted_at && !s.done).toArray()
  }
}

class PantryItemRepository extends BaseRepository<PantryItem> {
  async listLowStock(): Promise<PantryItem[]> {
    return db.pantry_items
      .filter((p) => !p.deleted_at && p.quantity <= p.low_threshold)
      .toArray()
  }
}

class HabitRepository extends BaseRepository<Habit> {
  async listActive(): Promise<Habit[]> {
    return db.habits.filter((h) => !h.deleted_at && !h.archived).toArray()
  }
}

class HabitLogRepository extends BaseRepository<HabitLog> {
  /** 通过复合索引 [habit_id+date] 高效定位 */
  async getForDate(habitId: string, date: string): Promise<HabitLog | null> {
    const list = await db.habit_logs
      .where('[habit_id+date]')
      .equals([habitId, date])
      .filter((l) => !l.deleted_at)
      .toArray()
    return list[0] ?? null
  }
}

/**
 * Settings 是 key-value 表,逻辑上比一般实体特殊一点:
 * - 用 key 当业务主键(SETTING_KEYS 枚举),id 仅作内部主键
 * - 提供 getValue / setValue 而不是裸 create/update,避免每次都查 key 是否存在
 */
class SettingRepository extends BaseRepository<Setting> {
  /** 取某个 key 的值;不存在返回 null */
  async getValue<V = unknown>(key: string): Promise<V | null> {
    const row = await db.settings.where('key').equals(key).first()
    if (!row || row.deleted_at) return null
    return row.value as V
  }

  /** upsert:有则更新,无则创建 */
  async setValue<V = unknown>(key: string, value: V): Promise<void> {
    const existing = await db.settings.where('key').equals(key).first()
    if (existing) {
      await this.update(existing.id, { value } as Partial<Setting>)
    } else {
      // 走 create() 而不是裸 db.add() —— 自动注入 user_id + 触发同步
      await this.create({ key, value } as Omit<Setting, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'sync_status' | 'device_id' | 'schema_version'>)
    }
  }
}

// ─── 单例导出 ──────────────────────────────────────────────────
export const tagRepo = new TagRepository(db.tags)
export const calendarRepo = new CalendarEventRepository(db.calendar_events)
export const focusRepo = new FocusSessionRepository(db.focus_sessions)
export const journalRepo = new JournalRepository(db.journals)
export const recipeRepo = new RecipeRepository(db.recipes)
export const recipeItemRepo = new RecipeItemRepository(db.recipe_items)
export const shoppingRepo = new ShoppingItemRepository(db.shopping_items)
export const pantryRepo = new PantryItemRepository(db.pantry_items)
export const habitRepo = new HabitRepository(db.habits)
export const habitLogRepo = new HabitLogRepository(db.habit_logs)
export const settingsRepo = new SettingRepository(db.settings)
