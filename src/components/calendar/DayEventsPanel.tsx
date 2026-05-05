import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { calendarRepo } from '@/repositories'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toDayKey, formatTime, isSameDay } from '@/lib/calendar-utils'
import {
  ensureNotificationPermission,
  rescheduleUpcomingReminders,
} from '@/lib/notifications'

const REMINDER_PRESETS: Array<{ label: string; minutes: number }> = [
  { label: '准时', minutes: 0 },
  { label: '5 分钟前', minutes: 5 },
  { label: '15 分钟前', minutes: 15 },
  { label: '1 小时前', minutes: 60 },
  { label: '1 天前', minutes: 1440 },
]

export function DayEventsPanel({ day }: { day: Date }) {
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState(60) // 分钟
  const [location, setLocation] = useState('')
  const [reminders, setReminders] = useState<number[]>([15])
  const [allDay, setAllDay] = useState(false)
  const [adding, setAdding] = useState(false)

  const dayKey = toDayKey(day)

  const events = useLiveQuery(async () => {
    const start = new Date(day)
    start.setHours(0, 0, 0, 0)
    const end = new Date(day)
    end.setHours(23, 59, 59, 999)
    const arr = await calendarRepo.listInRange(
      start.toISOString(),
      end.toISOString(),
    )
    // 排序:全天事件靠前,然后按开始时间
    return arr.sort((a, b) => {
      if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
      return a.start_at.localeCompare(b.start_at)
    })
  }, [dayKey], [])

  const isToday = isSameDay(day, new Date())
  const titleLabel = useMemo(
    () =>
      isToday
        ? '今天'
        : day.toLocaleDateString('zh-CN', {
            month: 'long',
            day: 'numeric',
            weekday: 'short',
          }),
    [day, isToday],
  )

  async function handleAdd() {
    if (!title.trim()) return

    let startIso: string
    let endIso: string
    if (allDay) {
      const s = new Date(day)
      s.setHours(0, 0, 0, 0)
      const e = new Date(day)
      e.setHours(23, 59, 59, 999)
      startIso = s.toISOString()
      endIso = e.toISOString()
    } else {
      const [h, m] = time.split(':').map(Number)
      const s = new Date(day)
      s.setHours(h ?? 9, m ?? 0, 0, 0)
      const e = new Date(s.getTime() + duration * 60_000)
      startIso = s.toISOString()
      endIso = e.toISOString()
    }

    if (reminders.length > 0) {
      // 提醒需要权限,首次创建带提醒的事件时索取
      await ensureNotificationPermission()
    }

    await calendarRepo.create({
      title: title.trim(),
      description: '',
      start_at: startIso,
      end_at: endIso,
      all_day: allDay,
      location: location.trim(),
      tag_ids: [],
      reminders_minutes: reminders,
    })

    // 重新调度提醒(包含刚创建的)
    await rescheduleUpcomingReminders()

    // 重置
    setTitle('')
    setLocation('')
    setAdding(false)
  }

  function toggleReminder(min: number) {
    setReminders((prev) =>
      prev.includes(min) ? prev.filter((x) => x !== min) : [...prev, min].sort((a, b) => a - b),
    )
  }

  async function handleDelete(id: string) {
    await calendarRepo.softDelete(id)
    await rescheduleUpcomingReminders()
  }

  return (
    <GlassPanel padding="lg" radius="lg" variant="strong">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          {titleLabel}
        </h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[11px] underline"
            style={{ color: 'var(--bn-text-tertiary)' }}
          >
            + 新事件
          </button>
        )}
      </div>

      {/* 事件列表 */}
      {(events ?? []).length === 0 && !adding && (
        <p className="py-3 text-center text-sm" style={{ color: 'var(--bn-text-tertiary)' }}>
          这一天还没有安排
        </p>
      )}

      <div className="space-y-1.5">
        {(events ?? []).map((ev) => (
          <div
            key={ev.id}
            className="group flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-white/10"
          >
            <span
              className="bn-mono mt-0.5 w-12 shrink-0 text-[11px]"
              style={{ color: 'var(--bn-text-tertiary)' }}
            >
              {ev.all_day ? '全天' : formatTime(ev.start_at)}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-medium"
                style={{ color: 'var(--bn-text-primary)' }}
              >
                {ev.title}
              </p>
              {(ev.location || (ev.reminders_minutes && ev.reminders_minutes.length > 0)) && (
                <p
                  className="mt-0.5 truncate text-[11px]"
                  style={{ color: 'var(--bn-text-tertiary)' }}
                >
                  {ev.location && <>📍 {ev.location} </>}
                  {ev.reminders_minutes && ev.reminders_minutes.length > 0 && (
                    <>🔔 {ev.reminders_minutes.length} 个提醒</>
                  )}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleDelete(ev.id)}
              className="opacity-0 transition-opacity group-hover:opacity-100"
              style={{ color: 'var(--bn-text-tertiary)', fontSize: '11px' }}
              aria-label="删除"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* 新事件表单 */}
      {adding && (
        <div className="mt-3 space-y-2 border-t pt-3"
          style={{ borderColor: 'var(--bn-row-border)' }}>
          <Input
            placeholder="事件名称"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <div className="flex items-center gap-2 text-[11px]"
            style={{ color: 'var(--bn-text-secondary)' }}>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              全天
            </label>
          </div>

          {!allDay && (
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="rounded-lg px-2.5 py-1.5 text-sm bn-mono"
                style={{
                  background: 'var(--bn-glass)',
                  border: '0.5px solid var(--bn-glass-border)',
                  color: 'var(--bn-text-primary)',
                }}
              />
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="rounded-lg px-2.5 py-1.5 text-sm"
                style={{
                  background: 'var(--bn-glass)',
                  border: '0.5px solid var(--bn-glass-border)',
                  color: 'var(--bn-text-primary)',
                }}
              >
                <option value={15}>15 分钟</option>
                <option value={30}>30 分钟</option>
                <option value={60}>1 小时</option>
                <option value={90}>1.5 小时</option>
                <option value={120}>2 小时</option>
                <option value={180}>3 小时</option>
              </select>
            </div>
          )}

          <Input
            placeholder="地点(可选)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />

          <div className="flex flex-wrap gap-1.5">
            {REMINDER_PRESETS.map((r) => {
              const active = reminders.includes(r.minutes)
              return (
                <button
                  key={r.minutes}
                  type="button"
                  onClick={() => toggleReminder(r.minutes)}
                  className="rounded-full px-2.5 py-1 text-[11px] transition-all"
                  style={{
                    background: active ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                    color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
                    border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
                  }}
                >
                  🔔 {r.label}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={handleAdd} disabled={!title.trim()}>
              添加
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              取消
            </Button>
          </div>
        </div>
      )}
    </GlassPanel>
  )
}
