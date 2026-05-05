import { useState, useEffect } from 'react'
import { calendarRepo } from '@/repositories'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  ensureNotificationPermission,
  rescheduleUpcomingReminders,
} from '@/lib/notifications'
import type { CalendarEvent, RecurrenceRule } from '@/types'
import type { ExpandedEvent } from '@/lib/recurrence'

const REMINDER_PRESETS: Array<{ label: string; minutes: number }> = [
  { label: '准时', minutes: 0 },
  { label: '5 分前', minutes: 5 },
  { label: '15 分前', minutes: 15 },
  { label: '1 小时前', minutes: 60 },
  { label: '1 天前', minutes: 1440 },
]

const WEEKDAYS = [
  { iso: 1, label: '一' },
  { iso: 2, label: '二' },
  { iso: 3, label: '三' },
  { iso: 4, label: '四' },
  { iso: 5, label: '五' },
  { iso: 6, label: '六' },
  { iso: 7, label: '日' },
]

interface Props {
  /** 已有事件 → 编辑模式;null + defaultDay → 创建模式 */
  event: ExpandedEvent | null
  defaultDay: Date
  onClose: () => void
}

export function EventEditor({ event, defaultDay, onClose }: Props) {
  const isEditing = event !== null
  // 重复实例编辑时,操作的是母事件(parent_id)
  const editingId = event?.parent_id ?? event?.id ?? null

  const [title, setTitle] = useState(event?.title ?? '')
  const [time, setTime] = useState(() => {
    if (event && !event.all_day) {
      const d = new Date(event.start_at)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    return '09:00'
  })
  const [duration, setDuration] = useState(() => {
    if (event && !event.all_day) {
      const d = (Date.parse(event.end_at) - Date.parse(event.start_at)) / 60000
      return Math.max(15, Math.round(d))
    }
    return 60
  })
  const [date, setDate] = useState(() => {
    const d = event ? new Date(event.start_at) : defaultDay
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const [location, setLocation] = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [reminders, setReminders] = useState<number[]>(
    event?.reminders_minutes ?? [15],
  )
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(
    event?.recurrence ?? null,
  )

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggleReminder(min: number) {
    setReminders((prev) =>
      prev.includes(min)
        ? prev.filter((x) => x !== min)
        : [...prev, min].sort((a, b) => a - b),
    )
  }

  async function save() {
    if (!title.trim()) return

    let startIso: string
    let endIso: string
    const [yyyy, mm, dd] = date.split('-').map(Number)
    if (allDay) {
      const s = new Date(yyyy!, mm! - 1, dd!, 0, 0, 0, 0)
      const e = new Date(yyyy!, mm! - 1, dd!, 23, 59, 59, 999)
      startIso = s.toISOString()
      endIso = e.toISOString()
    } else {
      const [h, m] = time.split(':').map(Number)
      const s = new Date(yyyy!, mm! - 1, dd!, h ?? 9, m ?? 0, 0, 0)
      const e = new Date(s.getTime() + duration * 60_000)
      startIso = s.toISOString()
      endIso = e.toISOString()
    }

    if (reminders.length > 0) await ensureNotificationPermission()

    const payload: Omit<CalendarEvent, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'sync_status' | 'device_id' | 'schema_version'> = {
      title: title.trim(),
      description: description.trim(),
      start_at: startIso,
      end_at: endIso,
      all_day: allDay,
      location: location.trim(),
      tag_ids: [],
      reminders_minutes: reminders,
      recurrence,
    }

    if (isEditing && editingId) {
      await calendarRepo.update(editingId, payload)
    } else {
      await calendarRepo.create(payload)
    }

    await rescheduleUpcomingReminders()
    onClose()
  }

  async function remove() {
    if (!editingId) return
    if (!confirm(
      recurrence
        ? '删除后所有重复实例都会消失。确认?'
        : '确认删除这个事件?',
    )) return
    await calendarRepo.softDelete(editingId)
    await rescheduleUpcomingReminders()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-5"
        style={{
          background: 'var(--bn-bg)',
          border: '0.5px solid var(--bn-glass-border)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
            {isEditing ? '编辑事件' : '新事件'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm"
            style={{ color: 'var(--bn-text-tertiary)' }}
          >
            ✕
          </button>
        </div>

        <Input
          placeholder="事件名称"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={!isEditing}
        />

        <div className="mt-2 flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-sm"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
              color: 'var(--bn-text-primary)',
            }}
          />
          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer"
            style={{ color: 'var(--bn-text-secondary)' }}>
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            全天
          </label>
        </div>

        {!allDay && (
          <div className="mt-2 flex items-center gap-2">
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
              <option value={240}>4 小时</option>
            </select>
          </div>
        )}

        <Input
          className="mt-2"
          placeholder="地点(可选)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        <textarea
          placeholder="详情说明(可选)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-2 w-full rounded-lg p-2.5 text-sm"
          style={{
            background: 'var(--bn-glass)',
            border: '0.5px solid var(--bn-glass-border)',
            color: 'var(--bn-text-primary)',
            fontFamily: 'inherit',
          }}
        />

        {/* 提醒 */}
        <p className="mb-1 mt-3 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          提醒
        </p>
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

        {/* 重复 */}
        <p className="mb-1 mt-3 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          重复
        </p>
        <RecurrencePicker value={recurrence} onChange={setRecurrence} />

        {/* 操作 */}
        <div className="mt-4 flex items-center gap-2">
          <Button onClick={save} disabled={!title.trim()}>
            {isEditing ? '保存' : '创建'}
          </Button>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          {isEditing && (
            <Button variant="ghost" onClick={remove} className="ml-auto">
              <span style={{ color: 'var(--bn-negative)' }}>删除</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function RecurrencePicker({
  value,
  onChange,
}: {
  value: RecurrenceRule | null
  onChange: (v: RecurrenceRule | null) => void
}) {
  const [showCustom, setShowCustom] = useState(false)

  const PRESETS: Array<{ label: string; rule: RecurrenceRule | null }> = [
    { label: '不重复', rule: null },
    { label: '每天', rule: { freq: 'daily' } },
    { label: '工作日', rule: { freq: 'weekly', by_weekday: [1, 2, 3, 4, 5] } },
    { label: '每周', rule: { freq: 'weekly' } },
    { label: '每月', rule: { freq: 'monthly' } },
  ]

  const isPreset = (rule: RecurrenceRule | null): boolean => {
    if (!value && !rule) return true
    if (!value || !rule) return false
    return JSON.stringify(value) === JSON.stringify(rule)
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p, i) => {
          const active = isPreset(p.rule)
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                onChange(p.rule)
                setShowCustom(false)
              }}
              className="rounded-full px-2.5 py-1 text-[11px] transition-all"
              style={{
                background: active ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
                border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
              }}
            >
              {p.label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setShowCustom(!showCustom)}
          className="rounded-full px-2.5 py-1 text-[11px] transition-all"
          style={{
            background: 'var(--bn-glass)',
            color: 'var(--bn-text-tertiary)',
            border: '0.5px solid var(--bn-glass-border)',
          }}
        >
          自定义周几
        </button>
      </div>

      {showCustom && (
        <div className="mt-2 flex gap-1">
          {WEEKDAYS.map((d) => {
            const active =
              value?.freq === 'weekly' && value.by_weekday?.includes(d.iso)
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => {
                  const cur = (value?.freq === 'weekly' && value.by_weekday) || []
                  const next = cur.includes(d.iso)
                    ? cur.filter((x) => x !== d.iso)
                    : [...cur, d.iso].sort()
                  onChange(
                    next.length > 0
                      ? { freq: 'weekly', by_weekday: next }
                      : null,
                  )
                }}
                className="h-7 w-7 rounded-full text-xs transition-all"
                style={{
                  background: active ? 'var(--bn-accent)' : 'var(--bn-glass)',
                  color: active ? 'var(--bn-button-fg)' : 'var(--bn-text-tertiary)',
                  border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
                }}
              >
                {d.label}
              </button>
            )
          })}
        </div>
      )}

      {value && (
        <div className="mt-2 flex items-center gap-2 text-[11px]"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          <span>结束于</span>
          <input
            type="date"
            value={value.until ? value.until.slice(0, 10) : ''}
            onChange={(e) => {
              const v = e.target.value
              onChange({
                ...value,
                until: v ? new Date(v + 'T23:59:59').toISOString() : null,
              })
            }}
            className="rounded-lg px-2 py-1 text-xs"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
              color: 'var(--bn-text-primary)',
            }}
          />
          {value.until && (
            <button
              type="button"
              onClick={() => onChange({ ...value, until: null })}
              className="text-[10px] underline"
            >
              清除
            </button>
          )}
        </div>
      )}
    </>
  )
}
