import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { GlassPanel } from '@/components/ui/GlassPanel'
import {
  CN_MONTHS,
  CN_WEEKDAYS_MON,
  endOfMonth,
  isSameDay,
  isSameMonth,
  monthGrid,
  startOfMonth,
  toDayKey,
} from '@/lib/calendar-utils'
import type { CalendarEvent } from '@/types'

interface Props {
  selectedDay: Date
  onSelectDay: (d: Date) => void
}

export function MonthView({ selectedDay, onSelectDay }: Props) {
  const [cursor, setCursor] = useState(startOfMonth(selectedDay))

  const cells = useMemo(() => monthGrid(cursor), [cursor])

  // 拉本月所有事件(月视图 6 周可能跨入前后月,所以用 cells 边界)
  const startIso = cells[0]!.toISOString()
  const endIso = useMemo(() => {
    const last = new Date(cells[41]!)
    last.setHours(23, 59, 59, 999)
    return last.toISOString()
  }, [cells])

  const events = useLiveQuery(
    () =>
      db.calendar_events
        .filter(
          (e) =>
            !e.deleted_at && e.end_at >= startIso && e.start_at <= endIso,
        )
        .toArray(),
    [startIso, endIso],
    [],
  )

  // 每天的事件分桶
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events ?? []) {
      const start = new Date(ev.start_at)
      const end = new Date(ev.end_at)
      const cur = new Date(start)
      cur.setHours(0, 0, 0, 0)
      const last = new Date(end)
      last.setHours(0, 0, 0, 0)
      while (cur <= last) {
        const k = toDayKey(cur)
        const arr = map.get(k) ?? []
        arr.push(ev)
        map.set(k, arr)
        cur.setDate(cur.getDate() + 1)
      }
    }
    return map
  }, [events])

  const today = new Date()

  function nav(deltaMonths: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + deltaMonths, 1))
  }

  return (
    <GlassPanel padding="md" radius="lg">
      {/* 月份标题 + 翻页 */}
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => nav(-1)}
          className="rounded-full px-2 py-1 text-sm transition-colors hover:opacity-70"
          style={{ color: 'var(--bn-text-secondary)' }}
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => {
            setCursor(startOfMonth(today))
            onSelectDay(today)
          }}
          className="text-sm font-medium"
          style={{ color: 'var(--bn-text-primary)' }}
        >
          {cursor.getFullYear()} 年 {CN_MONTHS[cursor.getMonth()]}
        </button>
        <button
          type="button"
          onClick={() => nav(1)}
          className="rounded-full px-2 py-1 text-sm transition-colors hover:opacity-70"
          style={{ color: 'var(--bn-text-secondary)' }}
        >
          →
        </button>
      </div>

      {/* 周几表头 */}
      <div className="mb-1 grid grid-cols-7">
        {CN_WEEKDAYS_MON.map((w, i) => (
          <div
            key={w}
            className="py-1 text-center text-[10px] uppercase tracking-wider"
            style={{
              color: i >= 5 ? 'var(--bn-text-tertiary)' : 'var(--bn-text-secondary)',
            }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 6 × 7 格 */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d) => {
          const k = toDayKey(d)
          const dayEvents = eventsByDay.get(k) ?? []
          const isToday = isSameDay(d, today)
          const isSelected = isSameDay(d, selectedDay)
          const inMonth = isSameMonth(d, cursor)

          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelectDay(d)}
              className="relative flex aspect-square flex-col items-center justify-start rounded-lg p-1 transition-all"
              style={{
                background: isSelected ? 'var(--bn-glass-strong)' : 'transparent',
                border: isSelected
                  ? '0.5px solid var(--bn-accent)'
                  : '0.5px solid transparent',
                opacity: inMonth ? 1 : 0.35,
              }}
            >
              <span
                className="text-xs"
                style={{
                  color: isToday ? 'var(--bn-accent)' : 'var(--bn-text-primary)',
                  fontWeight: isToday ? 600 : 400,
                }}
              >
                {d.getDate()}
              </span>
              {/* 事件点(最多 3 个)*/}
              {dayEvents.length > 0 && (
                <div className="mt-0.5 flex gap-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <span
                      key={ev.id}
                      className="h-1 w-1 rounded-full"
                      style={{ background: 'var(--bn-accent)' }}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span
                      className="text-[8px]"
                      style={{ color: 'var(--bn-text-tertiary)' }}
                    >
                      +{dayEvents.length - 3}
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </GlassPanel>
  )
}

// 让导入它的代码看到该类型已使用
void ({} as { _: typeof endOfMonth })
