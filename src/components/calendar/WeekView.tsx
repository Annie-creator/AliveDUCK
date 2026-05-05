import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { CN_WEEKDAYS_MON, isSameDay, toDayKey } from '@/lib/calendar-utils'
import { expandRecurring, type ExpandedEvent } from '@/lib/recurrence'

interface Props {
  weekStart: Date // 周一为起点
  onSelectDay: (d: Date) => void
  onClickEvent: (ev: ExpandedEvent) => void
}

const HOUR_HEIGHT = 36 // px,每小时占多高
const HOUR_START = 6 // 早 6 点开始显示
const HOUR_END = 24 // 24 点(其实 23:59 结束)
const VISIBLE_HOURS = HOUR_END - HOUR_START

export function WeekView({ weekStart, onSelectDay, onClickEvent }: Props) {
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      return d
    })
  }, [weekStart])

  const startIso = useMemo(() => {
    const d = new Date(weekStart)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }, [weekStart])
  const endIso = useMemo(() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }, [weekStart])

  const rawEvents = useLiveQuery(
    () =>
      db.calendar_events
        .filter(
          (e) =>
            !e.deleted_at &&
            (
              // 一次性事件:与窗口有交集
              (!e.recurrence && e.end_at >= startIso && e.start_at <= endIso) ||
              // 重复事件:总在候选(展开器会精确过滤)
              !!e.recurrence
            ),
        )
        .toArray(),
    [startIso, endIso],
    [],
  )

  const events = useMemo(
    () => expandRecurring(rawEvents ?? [], startIso, endIso),
    [rawEvents, startIso, endIso],
  )

  const today = new Date()

  return (
    <GlassPanel padding="md" radius="lg">
      {/* 表头:7 天 */}
      <div className="mb-1 grid" style={{ gridTemplateColumns: '40px repeat(7, 1fr)' }}>
        <div />
        {days.map((d, i) => {
          const isToday = isSameDay(d, today)
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDay(d)}
              className="flex flex-col items-center py-1 transition-opacity hover:opacity-80"
            >
              <span className="text-[10px] uppercase tracking-wider"
                style={{ color: 'var(--bn-text-tertiary)' }}>
                {CN_WEEKDAYS_MON[i]}
              </span>
              <span
                className="bn-mono mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs"
                style={{
                  background: isToday ? 'var(--bn-accent)' : 'transparent',
                  color: isToday ? 'var(--bn-button-fg)' : 'var(--bn-text-primary)',
                  fontWeight: isToday ? 600 : 400,
                }}
              >
                {d.getDate()}
              </span>
            </button>
          )
        })}
      </div>

      {/* 全天事件行 */}
      {events.some((e) => e.all_day && days.some((d) => sameDayUtcLocal(d, e))) && (
        <div className="mb-1 grid" style={{ gridTemplateColumns: '40px repeat(7, 1fr)' }}>
          <div className="text-[9px] py-1 text-center"
            style={{ color: 'var(--bn-text-tertiary)' }}>
            全天
          </div>
          {days.map((d, i) => {
            const allDay = events.filter((e) => e.all_day && sameDayUtcLocal(d, e))
            return (
              <div key={i} className="space-y-0.5 px-0.5">
                {allDay.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onClickEvent(e)}
                    className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px]"
                    style={{
                      background: 'var(--bn-accent)',
                      color: 'var(--bn-button-fg)',
                    }}
                  >
                    {e.title}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* 时间轴主体 */}
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: '40px repeat(7, 1fr)',
          height: `${VISIBLE_HOURS * HOUR_HEIGHT}px`,
        }}
      >
        {/* 时间刻度 */}
        <div className="relative">
          {Array.from({ length: VISIBLE_HOURS }).map((_, i) => (
            <div
              key={i}
              className="absolute right-1 text-[9px]"
              style={{
                top: `${i * HOUR_HEIGHT}px`,
                color: 'var(--bn-text-tertiary)',
              }}
            >
              {String(i + HOUR_START).padStart(2, '0')}
            </div>
          ))}
        </div>

        {/* 7 天列 */}
        {days.map((d, dayIdx) => {
          const dayEvents = events.filter(
            (e) => !e.all_day && sameDayUtcLocal(d, e),
          )
          return (
            <div
              key={dayIdx}
              className="relative border-l"
              style={{ borderColor: 'var(--bn-row-border)' }}
            >
              {/* 小时分隔线 */}
              {Array.from({ length: VISIBLE_HOURS }).map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t"
                  style={{
                    top: `${i * HOUR_HEIGHT}px`,
                    borderColor: 'var(--bn-row-border)',
                    opacity: 0.4,
                  }}
                />
              ))}

              {/* 事件块 */}
              {dayEvents.map((e) => {
                const start = new Date(e.start_at)
                const end = new Date(e.end_at)
                const startHour = start.getHours() + start.getMinutes() / 60
                const endHour = end.getHours() + end.getMinutes() / 60
                const top = (Math.max(HOUR_START, startHour) - HOUR_START) * HOUR_HEIGHT
                const height = Math.max(
                  16,
                  (Math.min(HOUR_END, endHour) - Math.max(HOUR_START, startHour)) * HOUR_HEIGHT - 2,
                )
                if (endHour < HOUR_START || startHour > HOUR_END) return null
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onClickEvent(e)}
                    className="absolute left-0.5 right-0.5 truncate rounded px-1 py-0.5 text-left text-[10px] shadow-sm transition-opacity hover:opacity-85"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      background: e.is_recurring_instance
                        ? 'var(--bn-cat-2)'
                        : 'var(--bn-accent)',
                      color: 'var(--bn-button-fg)',
                      lineHeight: '1.2',
                    }}
                  >
                    <span className="font-medium">{e.title}</span>
                    {height > 30 && e.location && (
                      <div className="truncate opacity-80">📍 {e.location}</div>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </GlassPanel>
  )
}

/**
 * 判断本地日期 d 是否落在 event 的起始日期上(都按本地时区算)
 */
function sameDayUtcLocal(d: Date, e: ExpandedEvent): boolean {
  const evStart = new Date(e.start_at)
  return toDayKey(d) === toDayKey(evStart)
}
