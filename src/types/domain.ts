import type { SyncableEntity } from './sync'

// ─── 全局标签 ─────────────────────────────────────────────────────────────
export interface Tag extends SyncableEntity {
  name: string
  color: string
}

// ─── 日历事件 ────────────────────────────────────────────────────────────
export interface CalendarEvent extends SyncableEntity {
  title: string
  description: string
  /** 全天事件设为该日 00:00 */
  start_at: string
  /** 同 day 的全天事件可与 start_at 同值 */
  end_at: string
  all_day: boolean
  location: string
  tag_ids: string[]
  /** 提醒提前的分钟数,空数组表示不提醒 */
  reminders_minutes: number[]
  /**
   * 重复规则。null 表示一次性事件。
   * 简化的 RRULE 子集 — 满足学生场景:每天 / 每周 N / 每月 / 工作日。
   */
  recurrence: RecurrenceRule | null
}

export interface RecurrenceRule {
  /** 频率 */
  freq: 'daily' | 'weekly' | 'monthly'
  /** weekly 用:1=Mon..7=Sun。daily/monthly 忽略 */
  by_weekday?: number[]
  /** 每 N 个周期(默认 1。如 every 2 weeks 就是 2)*/
  interval?: number
  /** 截止日期 ISO,空表示永远 */
  until?: string | null
  /** 仅对 monthly 有效:月几号(1..31)。空时取 start_at 那天 */
  by_month_day?: number[]
}

// ─── 专注计时 ────────────────────────────────────────────────────────────
export interface FocusSession extends SyncableEntity {
  started_at: string
  ended_at: string | null
  /** 持续秒数,ended_at 为 null 时为当前累积 */
  duration_seconds: number
  /** 关联日程 / 习惯 / 任意自定义标记 */
  linked_event_id: string | null
  linked_habit_id: string | null
  note: string
  tag_ids: string[]
}

// ─── 灵感 / 日志 / 富文本 ──────────────────────────────────────────────
export interface Journal extends SyncableEntity {
  title: string
  /** Markdown 文本 */
  content: string
  /** 图片 URL 数组 —— Phase 2 之后走 Supabase Storage,Phase 1 暂存 base64 */
  image_urls: string[]
  mood: 'great' | 'good' | 'meh' | 'bad' | 'awful' | 'tired' | 'anxious' | 'happy' | 'thoughtful' | null
  tag_ids: string[]
}

// ─── 食谱 + 食谱成分 ──────────────────────────────────────────────────

/** 餐次类别 — 一道菜可属于多个餐次（如三明治可早可午） */
export type MealType = '早饭' | '午饭' | '晚饭' | '夜宵' | '零食' | '饮品'
export const MEAL_TYPES: MealType[] = ['早饭', '午饭', '晚饭', '夜宵', '零食', '饮品']

export interface Recipe extends SyncableEntity {
  name: string
  description: string
  servings: number
  /** 烹饪步骤,Markdown */
  instructions: string
  cover_image_url: string | null
  tag_ids: string[]
  /** 适合的餐次（Phase D-2 新增,可多选） */
  meal_types: MealType[]
  /** 大致烹饪时长(分钟,Phase D-2 新增) */
  duration_minutes: number
}

export interface RecipeItem extends SyncableEntity {
  recipe_id: string
  ingredient_name: string
  quantity: number
  unit: string
}

// ─── 购物清单 ────────────────────────────────────────────────────────
export interface ShoppingItem extends SyncableEntity {
  name: string
  category: string
  quantity: number
  unit: string
  done: boolean
  done_at: string | null
  /** 完成后是否一键加入 pantry */
  auto_to_pantry: boolean
  note: string
  tag_ids: string[]
}

// ─── 库存 ────────────────────────────────────────────────────────────
export interface PantryItem extends SyncableEntity {
  name: string
  category: string
  quantity: number
  unit: string
  /** 低库存阈值,quantity 低于此值时提醒 */
  low_threshold: number
  /** 过期日期(YYYY-MM-DD) */
  expires_on: string | null
  note: string
  tag_ids: string[]
}

// ─── 习惯 + 打卡 ─────────────────────────────────────────────────────
export interface Habit extends SyncableEntity {
  name: string
  description: string
  icon: string
  color: string
  /** 周几执行,0=周日 .. 6=周六。空数组=任意 */
  days_of_week: number[]
  /** 每日目标次数 */
  target_per_day: number
  archived: boolean
}

export interface HabitLog extends SyncableEntity {
  habit_id: string
  /** 打卡日期 YYYY-MM-DD */
  date: string
  count: number
  note: string
}

// ─── 全局设置(键值对)───────────────────────────────────────────────
export interface Setting extends SyncableEntity {
  key: string
  /** 任意 JSON,业务侧自行解析 */
  value: unknown
}

/** 一些"硬编码"的设置 key,集中管理避免拼错 */
export const SETTING_KEYS = {
  THEME: 'theme', // 'light' | 'dark' | 'system'
  BASE_CURRENCY: 'base_currency', // 默认 'EUR'
  EXCHANGE_RATES: 'exchange_rates', // { CNY: 7.8, USD: 0.92, ... } 相对 EUR
  DEFAULT_ACCOUNT_ID: 'default_account_id',
  WEEK_STARTS_ON: 'week_starts_on', // 0 周日,1 周一(欧洲常用 1)
  LAST_SYNCED_AT: 'last_synced_at', // Phase 3 用
} as const
