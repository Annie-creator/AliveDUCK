/**
 * 日历专用日期工具(独立于 lib/date.ts 的 ISO 字符串工具)。
 *
 * 关键约定:这里所有 Date 实例都用**本地时区**;ISO 字符串用 UTC。
 * 入库前用 toISOString() 转 UTC,展示时按本地拆。
 */

/** 周一为周的起点(欧洲常用)。返回 0..6,0=Mon, 6=Sun */
export function dowMondayBased(d: Date): number {
  return (d.getDay() + 6) % 7
}

/** 给定一个月份的某天,返回该月 1 号 */
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** 月份的最后一天 */
export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

/** YYYY-MM-DD,本地时区 */
export function toDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** YYYY-MM-DD → Date(本地午夜) */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

/**
 * 生成月视图所需的 6 周 × 7 天日期数组。
 * 从该月所在周的周一开始,共 42 天。
 */
export function monthGrid(reference: Date): Date[] {
  const first = startOfMonth(reference)
  const offset = dowMondayBased(first) // 周一=0
  const start = new Date(first)
  start.setDate(first.getDate() - offset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

/** 同一天?忽略时间 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** 同一个月? */
export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

/** 相对于今天,是过去/今天/未来 */
export function dayRelation(d: Date, today: Date = new Date()): 'past' | 'today' | 'future' {
  const a = toDayKey(d)
  const b = toDayKey(today)
  if (a < b) return 'past'
  if (a > b) return 'future'
  return 'today'
}

/** 中文月名 */
export const CN_MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
export const CN_WEEKDAYS_MON = ['一', '二', '三', '四', '五', '六', '日']

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
