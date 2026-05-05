import { useEffect, useState } from 'react'
import { MonthView } from '@/components/calendar/MonthView'
import { DayEventsPanel } from '@/components/calendar/DayEventsPanel'
import {
  ensureNotificationPermission,
  getNotificationPermission,
  rescheduleUpcomingReminders,
} from '@/lib/notifications'
import { GlassPanel } from '@/components/ui/GlassPanel'

export function CalendarPage() {
  const [selectedDay, setSelectedDay] = useState(() => new Date())
  const [permission, setPermission] = useState(getNotificationPermission())

  // 启动后扫一遍未来 24h 的提醒
  useEffect(() => {
    void rescheduleUpcomingReminders()
  }, [])

  async function requestPerm() {
    const p = await ensureNotificationPermission()
    setPermission(p)
    if (p === 'granted') {
      void rescheduleUpcomingReminders()
    }
  }

  return (
    <div className="space-y-5">
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
              · 仅在页面打开时生效,Phase 6 会上后台通知
            </span>
          </p>
        </GlassPanel>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MonthView selectedDay={selectedDay} onSelectDay={setSelectedDay} />
        <DayEventsPanel day={selectedDay} />
      </div>
    </div>
  )
}
