import Dexie, { type Table } from 'dexie'
import type {
  Account,
  Budget,
  CalendarEvent,
  Category,
  FinanceTransaction,
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

/**
 * 本地数据库定义。
 *
 * 每张表都按相同模式建立:
 * - 主键 id
 * - updated_at(同步增量拉取依据)
 * - deleted_at(软删过滤)
 * - 必要的业务索引
 *
 * Dexie 的索引语法:逗号分隔字段,& 表示主键,前缀字段表示二级索引。
 *
 * Phase 1:版本 1,空库直接建。
 * Phase 2+:加字段时新增 .version(2).upgrade(...) —— 不要改现有 .version(1)。
 */
export class BanyaDB extends Dexie {
  accounts!: Table<Account, string>
  categories!: Table<Category, string>
  finance_transactions!: Table<FinanceTransaction, string>
  budgets!: Table<Budget, string>

  tags!: Table<Tag, string>
  calendar_events!: Table<CalendarEvent, string>
  focus_sessions!: Table<FocusSession, string>
  journals!: Table<Journal, string>

  recipes!: Table<Recipe, string>
  recipe_items!: Table<RecipeItem, string>
  shopping_items!: Table<ShoppingItem, string>
  pantry_items!: Table<PantryItem, string>

  habits!: Table<Habit, string>
  habit_logs!: Table<HabitLog, string>

  settings!: Table<Setting, string>

  constructor() {
    super('banya_alive')

    // ─── v1 ──────────────────────────────────────────────────────────────
    this.version(1).stores({
      accounts: '&id, updated_at, deleted_at, sort_order, archived',
      categories: '&id, updated_at, deleted_at, kind, sort_order, archived',
      finance_transactions:
        '&id, updated_at, deleted_at, occurred_at, type, category_id, from_account_id, to_account_id',
      budgets: '&id, updated_at, deleted_at, month, category_id',

      tags: '&id, updated_at, deleted_at, name',

      calendar_events: '&id, updated_at, deleted_at, start_at, end_at',
      focus_sessions:
        '&id, updated_at, deleted_at, started_at, linked_event_id, linked_habit_id',

      journals: '&id, updated_at, deleted_at, created_at',

      recipes: '&id, updated_at, deleted_at, name',
      recipe_items: '&id, updated_at, deleted_at, recipe_id',

      shopping_items: '&id, updated_at, deleted_at, done, category',
      pantry_items: '&id, updated_at, deleted_at, category, name',

      habits: '&id, updated_at, deleted_at, archived',
      habit_logs: '&id, updated_at, deleted_at, habit_id, date, [habit_id+date]',

      settings: '&id, updated_at, deleted_at, &key',
    })

    // ─── v2 (Phase D-2): Recipe 加 meal_types[] + duration_minutes
    //     字段不索引,所以只需要 upgrade() 给老数据填默认 ──────────────
    this.version(2)
      .stores({
        recipes: '&id, updated_at, deleted_at, name',
      })
      .upgrade(async (tx) => {
        await tx.table('recipes').toCollection().modify((r: { meal_types?: unknown; duration_minutes?: unknown }) => {
          if (!Array.isArray(r.meal_types)) r.meal_types = []
          if (typeof r.duration_minutes !== 'number') r.duration_minutes = 30
        })
      })
  }
}

/**
 * 单例数据库实例。整个 app 共享同一份连接。
 *
 * 之所以做成单例:Dexie 的 Table 引用要求同一个 db 实例,
 * 跨模块创建多个 BanyaDB() 会拿到不同的连接,索引都不一致。
 */
export const db = new BanyaDB()
