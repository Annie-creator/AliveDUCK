/**
 * 重复事件展开器。
 *
 * 把 CalendarEvent 的 recurrence 规则在给定时间窗口内展开成具体的"实例事件"。
 * 实例不写库 — 是临时计算结果。删除/编辑某次实例的需求后续 Phase 6 加 exception_dates。
 *
 * 展开后每个实例:
 *  - id 保持原 id 加 ":YYYY-MM-DD" 后缀,方便去重和导航
 *  - start_at / end_at 是该实例的具体时间
 *  - 其他字段直接复制母事件
 */

import type { CalendarEvent } from '@/types'

export interface ExpandedEvent extends CalendarEvent {
  /** 是否是重复展开出来的实例(true 时 id 带后缀) */
  is_recurring_instance: boolean
  /** 母事件的 id(仅 recurring instance 才有)*/
  parent_id?: string
}

/**
 * 把 events 在 [windowStart, windowEnd) 内展开。
 * 一次性事件不变,有 recurrence 的事件展开成多个实例。
 */
export function expandRecurring(
  events: CalendarEvent[],
  windowStartIso: string,
  windowEndIso: string,
): ExpandedEvent[] {
  const out: ExpandedEvent[] = []
  const wStart = new Date(windowStartIso).getTime()
  const wEnd = new Date(windowEndIso).getTime()

  for (const ev of events) {
    if (!ev.recurrence) {
      // 一次性事件:只要和窗口有交集
      const evStart = new Date(ev.start_at).getTime()
      const evEnd = new Date(ev.end_at).getTime()
      if (evEnd >= wStart && evStart < wEnd) {
        out.push({ ...ev, is_recurring_instance: false })
      }
      continue
    }

    // 重复事件:从 start_at 开始算,在窗口内 yield 实例
    const r = ev.recurrence
    const interval = Math.max(1, r.interval ?? 1)
    const evStart = new Date(ev.start_at)
    const evEnd = new Date(ev.end_at)
    const evDurMs = evEnd.getTime() - evStart.getTime()
    const untilMs = r.until ? new Date(r.until).getTime() : Infinity

    // 限定迭代上限,防退化卡死
    const MAX_INSTANCES = 500
    let yielded = 0

    if (r.freq === 'daily') {
      // 从 windowStart 之前最近一次开始
      let cursor = new Date(evStart)
      // 跳到 windowStart 附近
      const daysSinceStart = Math.max(
        0,
        Math.floor((wStart - cursor.getTime()) / 86_400_000),
      )
      const skipCycles = Math.floor(daysSinceStart / interval)
      cursor = addDays(cursor, skipCycles * interval)

      while (cursor.getTime() < wEnd && cursor.getTime() <= untilMs && yielded < MAX_INSTANCES) {
        const instStart = cursor.getTime()
        const instEnd = instStart + evDurMs
        if (instEnd >= wStart) {
          out.push(makeInstance(ev, new Date(instStart), new Date(instEnd)))
          yielded++
        }
        cursor = addDays(cursor, interval)
      }
    } else if (r.freq === 'weekly') {
      // 每周指定 ISO weekday(1=Mon..7=Sun)
      const weekdays = (r.by_weekday && r.by_weekday.length > 0)
        ? r.by_weekday
        : [isoWeekday(evStart)]

      // 从 evStart 所在周往后扫
      const evStartWeek = startOfWeek(evStart)
      const wStartWeek = startOfWeek(new Date(wStart))
      const weeksDiff = Math.max(
        0,
        Math.floor(
          (wStartWeek.getTime() - evStartWeek.getTime()) / (7 * 86_400_000),
        ),
      )
      const skipWeeks = Math.floor(weeksDiff / interval)
      let weekCursor = addDays(evStartWeek, skipWeeks * interval * 7)

      while (weekCursor.getTime() < wEnd && yielded < MAX_INSTANCES) {
        for (const dow of weekdays) {
          const day = addDays(weekCursor, dow - 1) // 周一=offset 0
          const inst = new Date(day)
          inst.setHours(evStart.getHours(), evStart.getMinutes(), evStart.getSeconds(), 0)
          const instMs = inst.getTime()
          if (instMs < new Date(ev.start_at).getTime()) continue // 在母事件起始之前,跳过
          if (instMs > untilMs) continue
          const instEnd = instMs + evDurMs
          if (instEnd >= wStart && instMs < wEnd) {
            out.push(makeInstance(ev, new Date(instMs), new Date(instEnd)))
            yielded++
          }
        }
        weekCursor = addDays(weekCursor, 7 * interval)
      }
    } else if (r.freq === 'monthly') {
      // 每月几号(默认取 evStart 那天)
      const days = (r.by_month_day && r.by_month_day.length > 0)
        ? r.by_month_day
        : [evStart.getDate()]

      // 从 evStart 当月起,逐月推
      let monthCursor = new Date(evStart.getFullYear(), evStart.getMonth(), 1)
      const wEndMonth = new Date(wEnd)

      while (monthCursor.getTime() < wEnd && yielded < MAX_INSTANCES) {
        for (const d of days) {
          const lastDayOfMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate()
          const dd = Math.min(d, lastDayOfMonth)
          const inst = new Date(
            monthCursor.getFullYear(),
            monthCursor.getMonth(),
            dd,
            evStart.getHours(),
            evStart.getMinutes(),
            evStart.getSeconds(),
          )
          const instMs = inst.getTime()
          if (instMs < new Date(ev.start_at).getTime()) continue
          if (instMs > untilMs) continue
          const instEnd = instMs + evDurMs
          if (instEnd >= wStart && instMs < wEnd) {
            out.push(makeInstance(ev, new Date(instMs), new Date(instEnd)))
            yielded++
          }
        }
        // 下一个月
        monthCursor = new Date(
          monthCursor.getFullYear(),
          monthCursor.getMonth() + interval,
          1,
        )
        if (monthCursor.getTime() > wEndMonth.getTime() + 31 * 86_400_000) break
      }
    }
  }

  return out
}

function makeInstance(ev: CalendarEvent, start: Date, end: Date): ExpandedEvent {
  const dayKey = start.toISOString().slice(0, 10)
  return {
    ...ev,
    id: `${ev.id}:${dayKey}`,
    parent_id: ev.id,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    is_recurring_instance: true,
  }
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function isoWeekday(d: Date): number {
  // ISO: 1=Mon..7=Sun;getDay 是 0=Sun..6=Sat
  return ((d.getDay() + 6) % 7) + 1
}

function startOfWeek(d: Date): Date {
  // 周一为起点
  const day = (d.getDay() + 6) % 7
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day)
  return x
}
