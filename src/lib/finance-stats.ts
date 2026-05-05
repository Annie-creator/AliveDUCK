/**
 * 统计聚合层 —— 系统内 UI 和 Excel 导出共用同一份计算逻辑。
 *
 * 这是 Project Aim 钉死的:**口径必须一致**。
 * 所以无论是月度卡片、分类环形图、Excel 周汇总,都从这里取数。
 *
 * 性能:全部基于已经在内存的 transactions 数组做 reduce,不重复查 IndexedDB。
 * 调用方先用 financeRepo.listInRange() 拉数据,然后传进这里聚合。
 */

import type { Category, FinanceTransaction } from '@/types'
import { toBaseAmount } from './currency'

// ── 时间分桶工具 ─────────────────────────────────────────────────

/** YYYY-MM-DD → ISO 周(年-周号)*/
export function isoWeekKey(d: Date): string {
  // ISO 周:周一开始,第一周含周四
  const target = new Date(d)
  target.setUTCHours(0, 0, 0, 0)
  // 周四的日期决定 ISO 年
  target.setUTCDate(target.getUTCDate() + 3 - ((target.getUTCDay() + 6) % 7))
  const week1 = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const diffDays = (target.getTime() - week1.getTime()) / 86_400_000
  const weekNo = 1 + Math.round((diffDays - 3 + ((week1.getUTCDay() + 6) % 7)) / 7)
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// ── 通用聚合 ─────────────────────────────────────────────────────

export interface PeriodStats {
  income: number // 折算到 base 后
  expense: number
  balance: number // income - expense
  count: number
}

export function periodStats(txs: FinanceTransaction[]): PeriodStats {
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (t.deleted_at) continue
    const v = toBaseAmount(t.amount, t.exchange_rate)
    if (t.type === 'income') income += v
    else if (t.type === 'expense') expense += v
  }
  return {
    income,
    expense,
    balance: income - expense,
    count: txs.filter((t) => !t.deleted_at).length,
  }
}

// ── 按维度分组 ─────────────────────────────────────────────────

export interface GroupRow {
  key: string
  label: string
  expense: number
  income: number
  net: number
  count: number
}

/** 按 ISO 周分组 —— 用于周报表 */
export function groupByWeek(txs: FinanceTransaction[]): GroupRow[] {
  const map = new Map<string, GroupRow>()
  for (const t of txs) {
    if (t.deleted_at) continue
    const k = isoWeekKey(new Date(t.occurred_at))
    const row = map.get(k) ?? { key: k, label: k, expense: 0, income: 0, net: 0, count: 0 }
    const v = toBaseAmount(t.amount, t.exchange_rate)
    if (t.type === 'expense') row.expense += v
    else if (t.type === 'income') row.income += v
    row.net = row.income - row.expense
    row.count++
    map.set(k, row)
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
}

/** 按月分组 */
export function groupByMonth(txs: FinanceTransaction[]): GroupRow[] {
  const map = new Map<string, GroupRow>()
  for (const t of txs) {
    if (t.deleted_at) continue
    const k = monthKey(new Date(t.occurred_at))
    const row = map.get(k) ?? { key: k, label: k, expense: 0, income: 0, net: 0, count: 0 }
    const v = toBaseAmount(t.amount, t.exchange_rate)
    if (t.type === 'expense') row.expense += v
    else if (t.type === 'income') row.income += v
    row.net = row.income - row.expense
    row.count++
    map.set(k, row)
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
}

/** 按日分组 —— 日历热力图用 */
export function groupByDay(txs: FinanceTransaction[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of txs) {
    if (t.deleted_at || t.type !== 'expense') continue
    const k = dayKey(new Date(t.occurred_at))
    const v = toBaseAmount(t.amount, t.exchange_rate)
    map.set(k, (map.get(k) ?? 0) + v)
  }
  return map
}

/** 按分类分组 —— 环形图、品类排行用 */
export function groupByCategory(
  txs: FinanceTransaction[],
  categories: Category[],
): GroupRow[] {
  const catMap = new Map<string, Category>()
  for (const c of categories) catMap.set(c.id, c)

  const map = new Map<string, GroupRow>()
  for (const t of txs) {
    if (t.deleted_at) continue
    const cat = t.category_id ? catMap.get(t.category_id) : null
    const key = cat?.id ?? '_uncat'
    const label = cat?.name ?? '未分类'
    const row = map.get(key) ?? { key, label, expense: 0, income: 0, net: 0, count: 0 }
    const v = toBaseAmount(t.amount, t.exchange_rate)
    if (t.type === 'expense') row.expense += v
    else if (t.type === 'income') row.income += v
    row.net = row.income - row.expense
    row.count++
    map.set(key, row)
  }
  return Array.from(map.values()).sort((a, b) => b.expense - a.expense)
}

/** 按交易对象/商家分组 —— Top 商家排行用 */
export function groupByParticipant(txs: FinanceTransaction[]): GroupRow[] {
  const map = new Map<string, GroupRow>()
  for (const t of txs) {
    if (t.deleted_at || t.type !== 'expense') continue
    const key = t.participant.trim() || '(未命名)'
    const row = map.get(key) ?? { key, label: key, expense: 0, income: 0, net: 0, count: 0 }
    const v = toBaseAmount(t.amount, t.exchange_rate)
    row.expense += v
    row.net = -row.expense
    row.count++
    map.set(key, row)
  }
  return Array.from(map.values()).sort((a, b) => b.expense - a.expense)
}

// ── 时间范围工具 ──────────────────────────────────────────────────

export type TimeRangePreset =
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'last_30_days'
  | 'last_90_days'
  | 'all'

export interface TimeRange {
  startIso: string
  endIso: string // exclusive
  label: string
}

export function resolveTimeRange(preset: TimeRangePreset, now: Date = new Date()): TimeRange {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  function iso(date: Date): string {
    return date.toISOString()
  }
  function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
  }

  switch (preset) {
    case 'this_week': {
      // 周一为起点(欧洲常用)
      const day = (now.getDay() + 6) % 7
      const start = startOfDay(new Date(y, m, d - day))
      const end = new Date(start.getTime() + 7 * 86_400_000)
      return { startIso: iso(start), endIso: iso(end), label: '本周' }
    }
    case 'this_month': {
      const start = new Date(y, m, 1)
      const end = new Date(y, m + 1, 1)
      return { startIso: iso(start), endIso: iso(end), label: '本月' }
    }
    case 'last_month': {
      const start = new Date(y, m - 1, 1)
      const end = new Date(y, m, 1)
      return { startIso: iso(start), endIso: iso(end), label: '上月' }
    }
    case 'this_quarter': {
      const qStart = m - (m % 3)
      const start = new Date(y, qStart, 1)
      const end = new Date(y, qStart + 3, 1)
      return { startIso: iso(start), endIso: iso(end), label: '本季' }
    }
    case 'this_year': {
      return {
        startIso: iso(new Date(y, 0, 1)),
        endIso: iso(new Date(y + 1, 0, 1)),
        label: `${y} 年`,
      }
    }
    case 'last_30_days': {
      const end = startOfDay(new Date(y, m, d + 1))
      const start = new Date(end.getTime() - 30 * 86_400_000)
      return { startIso: iso(start), endIso: iso(end), label: '近 30 天' }
    }
    case 'last_90_days': {
      const end = startOfDay(new Date(y, m, d + 1))
      const start = new Date(end.getTime() - 90 * 86_400_000)
      return { startIso: iso(start), endIso: iso(end), label: '近 90 天' }
    }
    case 'all':
      return { startIso: '1970-01-01T00:00:00Z', endIso: iso(new Date(y + 100, 0, 1)), label: '全部' }
  }
}
