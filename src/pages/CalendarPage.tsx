import { useEffect, useMemo, useState } from 'react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { MonthView } from '@/components/calendar/MonthView'
import { WeekView } from '@/components/calendar/WeekView'
import { EventEditor } from '@/components/calendar/EventEditor'
import {
  ensureNotificationPermission,
  getNotificationPermission,
  rescheduleUpcomingReminders,
} from '@/lib/notifications'
import type { ExpandedEvent } from '@/lib/recurrence'

type ViewMode = 'month' | 'week'

export function CalendarPage() {
  const [view, setView] = useState<ViewMode>('month')
  const [selectedDay, setSelectedDay] = useState(() => new Date())
  const [editing, setEditing] = useState<ExpandedEvent | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [permission, setPermission] = useState(getNotificationPermission())

  useEffect(() => {
    void rescheduleUpcomingReminders()
  }, [])

  // 周视图的周起始日(周一)
  const weekStart = useMemo(() => {
    const d = new Date(selectedDay)
    const dow = (d.getDay() + 6) % 7 // 周一=0
    d.setDate(d.getDate() - dow)
    d.setHours(0, 0, 0, 0)
    return d
  }, [selectedDay])

  function handleClickEvent(ev: ExpandedEvent) {
    setEditing(ev)
    setShowEditor(true)
  }

  function handleNewEvent() {
    setEditing(null)
    setShowEditor(true)
  }

  function handleCloseEditor() {
    setShowEditor(false)
    setEditing(null)
  }

  async function requestPerm() {
    const p = await ensureNotificationPermission()
    setPermission(p)
    if (p === 'granted') void rescheduleUpcomingReminders()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p
            className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em]"
            style={{ color: 'var(--bn-text-secondary)' }}
          >
            CALENDAR
          </p>
          <h1
            className="text-[30px] leading-[1.15]"
            style={{
              color: 'var(--bn-text-primary)',
              fontWeight: 500,
              letterSpacing: '-0.03em',
            }}
          >
            日历
            <span
              className="ml-2"
              style={{
                color: 'var(--bn-text-tertiary)',
                fontWeight: 300,
                letterSpacing: '-0.02em',
              }}
            >
              一周一月,看清楚
            </span>
          </h1>
        </div>

        {/* 醒目的新建按钮 */}
        <Button onClick={handleNewEvent} size="lg">
          + 新事件
        </Button>
      </div>

      {/* 通知权限提示 */}
      {permission === 'default' && (
        <GlassPanel
          padding="md"
          radius="lg"
          style={{ borderLeft: '3px solid var(--bn-accent)' }}
        >
          <p className="text-xs" style={{ color: 'var(--bn-text-secondary)' }}>
            想让事件准时提醒你?<button
              type="button"
              onClick={requestPerm}
              className="ml-1 underline"
              style={{ color: 'var(--bn-accent)' }}
            >
              开启浏览器通知
            </button>
            <span className="ml-1" style={{ color: 'var(--bn-text-tertiary)' }}>
              · 仅在页面打开时生效
            </span>
          </p>
        </GlassPanel>
      )}

      {/* 视图切换 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-full p-0.5"
          style={{ background: 'var(--bn-glass)', border: '0.5px solid var(--bn-glass-border)' }}>
          {(['month', 'week'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setView(m)}
              className="rounded-full px-3 py-1 text-[12px] transition-all"
              style={{
                background: view === m ? 'var(--bn-glass-strong)' : 'transparent',
                color: view === m ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
                fontWeight: view === m ? 500 : 400,
                boxShadow: view === m ? 'inset 0 0 0 0.5px var(--bn-accent)' : 'none',
              }}
            >
              {m === 'month' ? '月视图' : '周视图'}
            </button>
          ))}
        </div>

        {view === 'week' && (
          <WeekNav weekStart={weekStart} onMove={(delta) => {
            const d = new Date(weekStart)
            d.setDate(d.getDate() + delta * 7)
            setSelectedDay(d)
          }} onToday={() => setSelectedDay(new Date())} />
        )}
      </div>

      {view === 'month' ? (
        <MonthView
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onClickEvent={handleClickEvent}
        />
      ) : (
        <WeekView
          weekStart={weekStart}
          onSelectDay={setSelectedDay}
          onClickEvent={handleClickEvent}
        />
      )}

      {showEditor && (
        <EventEditor
          event={editing}
          defaultDay={selectedDay}
          onClose={handleCloseEditor}
        />
      )}
    </div>
  )
}

function WeekNav({
  weekStart,
  onMove,
  onToday,
}: {
  weekStart: Date
  onMove: (deltaWeeks: number) => void
  onToday: () => void
}) {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()} – ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onMove(-1)}
        className="rounded-full px-2 py-1 text-sm hover:opacity-70"
        style={{ color: 'var(--bn-text-secondary)' }}
      >
        ←
      </button>
      <button
        type="button"
        onClick={onToday}
        className="text-xs"
        style={{ color: 'var(--bn-text-secondary)' }}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        className="rounded-full px-2 py-1 text-sm hover:opacity-70"
        style={{ color: 'var(--bn-text-secondary)' }}
      >
        →
      </button>
    </div>
  )
}
