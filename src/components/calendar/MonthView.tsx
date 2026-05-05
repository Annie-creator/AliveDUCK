import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { GlassPanel } from '@/components/ui/GlassPanel'
import {
  CN_MONTHS,
  CN_WEEKDAYS_MON,
  isSameDay,
  isSameMonth,
  monthGrid,
  startOfMonth,
  toDayKey,
} from '@/lib/calendar-utils'
import { expandRecurring, type ExpandedEvent } from '@/lib/recurrence'

interface Props {
  selectedDay: Date
  onSelectDay: (d: Date) => void
  onClickEvent: (ev: ExpandedEvent) => void
}

export function MonthView({ selectedDay, onSelectDay, onClickEvent }: Props) {
  const [cursor, setCursor] = useState(startOfMonth(selectedDay))
  const cells = useMemo(() => monthGrid(cursor), [cursor])

  const startIso = cells[0]!.toISOString()
  const endIso = useMemo(() => {
    const last = new Date(cells[41]!)
    last.setHours(23, 59, 59, 999)
    return last.toISOString()
  }, [cells])

  const rawEvents = useLiveQuery(
    () =>
      db.calendar_events
        .filter((e) => !e.deleted_at)
        .toArray(),
    [],
    [],
  )

  const events = useMemo(
    () => expandRecurring(rawEvents ?? [], startIso, endIso),
    [rawEvents, startIso, endIso],
  )

  // 按日分组
  const eventsByDay = useMemo(() => {
    const map = new Map<string, ExpandedEvent[]>()
    for (const ev of events) {
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
    // 每天内按开始时间排序
    for (const arr of map.values()) {
      arr.sort((a, b) => a.start_at.localeCompare(b.start_at))
    }
    return map
  }, [events])

  const today = new Date()

  function nav(deltaMonths: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + deltaMonths, 1))
  }

  return (
    <GlassPanel padding="md" radius="lg">
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

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d) => {
          const k = toDayKey(d)
          const dayEvents = eventsByDay.get(k) ?? []
          const isToday = isSameDay(d, today)
          const isSelected = isSameDay(d, selectedDay)
          const inMonth = isSameMonth(d, cursor)

          return (
            <div
              key={k}
              className="relative flex flex-col rounded-lg p-1 transition-all"
              style={{
                background: isSelected ? 'var(--bn-glass-strong)' : 'transparent',
                border: isSelected
                  ? '0.5px solid var(--bn-accent)'
                  : '0.5px solid transparent',
                opacity: inMonth ? 1 : 0.4,
                minHeight: '64px',
              }}
            >
              <button
                type="button"
                onClick={() => onSelectDay(d)}
                className="text-left text-[11px] transition-colors hover:opacity-80"
                style={{
                  color: isToday ? 'var(--bn-accent)' : 'var(--bn-text-primary)',
                  fontWeight: isToday ? 600 : 400,
                }}
              >
                {d.getDate()}
              </button>

              {/* 事件标题(最多 3 个,超出显示 +N)*/}
              <div className="mt-0.5 flex-1 space-y-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onClickEvent(ev)
                    }}
                    className="block w-full truncate rounded px-1 py-0.5 text-left text-[9px] transition-opacity hover:opacity-85"
                    style={{
                      background: ev.is_recurring_instance
                        ? `${getCssVar('--bn-cat-2')}`
                        : `${getCssVar('--bn-accent')}`,
                      color: 'var(--bn-button-fg)',
                    }}
                    title={ev.title}
                  >
                    {ev.all_day ? ev.title : `${formatHm(ev.start_at)} ${ev.title}`}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[9px]"
                    style={{ color: 'var(--bn-text-tertiary)' }}>
                    +{dayEvents.length - 3} 更多
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </GlassPanel>
  )
}

function getCssVar(name: string): string {
  // 用变量值即可,React 直接传 var() 也行;为了 inline style 简洁我们直接 var(...)
  return `var(${name})`
}

function formatHm(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
