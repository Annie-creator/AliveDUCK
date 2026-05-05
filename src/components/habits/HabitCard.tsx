import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { habitRepo, habitLogRepo } from '@/repositories'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { isTargetDay, isDayCompleted, getStreak } from '@/lib/habit-stats'
import { toDayKey, monthGrid, isSameMonth, isSameDay, CN_WEEKDAYS_MON } from '@/lib/calendar-utils'
import type { Habit } from '@/types'

/** 一个习惯的整体卡片:今日打卡 + streak + 月历热图 */
export function HabitCard({ habit }: { habit: Habit }) {
  const today = new Date()
  const dayKey = toDayKey(today)

  const todayLog = useLiveQuery(
    () =>
      db.habit_logs
        .where('[habit_id+date]')
        .equals([habit.id, dayKey])
        .filter((l) => !l.deleted_at)
        .first(),
    [habit.id, dayKey],
    null,
  )

  const [streak, setStreak] = useState(0)

  // streak 不是 useLiveQuery,因为它依赖多天日志,用 effect 触发重算
  useEffect(() => {
    void getStreak(habit).then(setStreak)
  }, [habit, todayLog])

  const targetToday = isTargetDay(habit, today)
  const completedToday = isDayCompleted(habit, todayLog ?? null)
  const count = todayLog?.count ?? 0

  async function increment() {
    if (todayLog) {
      await habitLogRepo.update(todayLog.id, { count: todayLog.count + 1 })
    } else {
      await habitLogRepo.create({
        habit_id: habit.id,
        date: dayKey,
        count: 1,
        note: '',
      })
    }
  }

  async function decrement() {
    if (!todayLog || todayLog.count <= 0) return
    if (todayLog.count === 1) {
      await habitLogRepo.softDelete(todayLog.id)
    } else {
      await habitLogRepo.update(todayLog.id, { count: todayLog.count - 1 })
    }
  }

  async function archive() {
    if (!confirm(`归档习惯 "${habit.name}"?可以在归档列表恢复。`)) return
    await habitRepo.update(habit.id, { archived: true })
  }

  return (
    <GlassPanel padding="md" radius="lg">
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
          style={{
            background: completedToday
              ? `${habit.color}30`
              : 'var(--bn-glass)',
            border: `0.5px solid ${
              completedToday ? habit.color : 'var(--bn-glass-border)'
            }`,
          }}
        >
          {habit.icon || '✦'}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3
              className="truncate text-sm font-medium"
              style={{ color: 'var(--bn-text-primary)' }}
            >
              {habit.name}
            </h3>
            <button
              type="button"
              onClick={archive}
              className="text-[10px] opacity-50 hover:opacity-100"
              style={{ color: 'var(--bn-text-tertiary)' }}
              title="归档"
            >
              ✕
            </button>
          </div>

          <div className="mt-1 flex items-center gap-2 text-[11px]"
            style={{ color: 'var(--bn-text-tertiary)' }}>
            <span>🔥 连续 {streak} 天</span>
            <span>·</span>
            <span>
              {targetToday
                ? `今天目标 ${habit.target_per_day} 次`
                : '今天非目标日'}
            </span>
          </div>

          {/* 计数器 */}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={decrement}
              disabled={count === 0}
              className="h-7 w-7 rounded-full text-sm transition-all disabled:opacity-30"
              style={{
                background: 'var(--bn-glass)',
                border: '0.5px solid var(--bn-glass-border)',
                color: 'var(--bn-text-primary)',
              }}
            >
              −
            </button>
            <span
              className="bn-mono w-12 text-center text-sm font-medium"
              style={{
                color: completedToday ? habit.color : 'var(--bn-text-primary)',
              }}
            >
              {count} / {habit.target_per_day}
            </span>
            <button
              type="button"
              onClick={increment}
              className="h-7 w-7 rounded-full text-sm transition-all"
              style={{
                background: completedToday ? habit.color : 'var(--bn-glass-strong)',
                color: completedToday ? '#FFF' : 'var(--bn-text-primary)',
                border: `0.5px solid ${completedToday ? habit.color : 'var(--bn-glass-border)'}`,
              }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 月历热图 */}
      <HabitHeatmap habit={habit} />
    </GlassPanel>
  )
}

/** 月视图小方块热图 — 完成深色,未完成浅色,非目标日灰色 */
function HabitHeatmap({ habit }: { habit: Habit }) {
  const today = new Date()
  const cells = monthGrid(today)
  const startKey = toDayKey(cells[0]!)
  const endKey = toDayKey(cells[41]!)

  // 拉本月窗口内所有该习惯的 logs
  const logs = useLiveQuery(
    () =>
      db.habit_logs
        .where('habit_id')
        .equals(habit.id)
        .filter(
          (l) => !l.deleted_at && l.date >= startKey && l.date <= endKey,
        )
        .toArray(),
    [habit.id, startKey, endKey],
    [],
  )

  const logByDate = new Map((logs ?? []).map((l) => [l.date, l]))

  return (
    <div className="mt-3">
      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {CN_WEEKDAYS_MON.map((w) => (
          <div
            key={w}
            className="text-center text-[8px] uppercase"
            style={{ color: 'var(--bn-text-tertiary)' }}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d) => {
          const k = toDayKey(d)
          const log = logByDate.get(k)
          const inMonth = isSameMonth(d, today)
          const isFuture = d > today && !isSameDay(d, today)
          const isTarget = isTargetDay(habit, d)
          const completed = isDayCompleted(habit, log ?? null)

          let bg = 'transparent'
          if (!inMonth || isFuture) {
            bg = 'transparent'
          } else if (!isTarget) {
            bg = 'var(--bn-glass)'
          } else if (completed) {
            bg = habit.color
          } else if (log && log.count > 0) {
            // 部分完成
            bg = `${habit.color}55`
          } else {
            bg = 'var(--bn-glass)'
          }

          return (
            <div
              key={k}
              className="aspect-square rounded-sm"
              title={`${k}${log ? ` · ${log.count} 次` : ''}`}
              style={{
                background: bg,
                opacity: inMonth ? 1 : 0.2,
                border: isSameDay(d, today)
                  ? '0.5px solid var(--bn-accent)'
                  : '0.5px solid transparent',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

/** 新建习惯表单 */
export function HabitCreator() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('✦')
  const [color, setColor] = useState('#7AA876')
  const [target, setTarget] = useState(1)
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7])

  const PRESET_ICONS = ['💪', '📚', '🏃', '💧', '🧘', '✏', '☕', '🎵', '🛏', '✦']
  const PRESET_COLORS = ['#7AA876', '#5B8AA8', '#C8553D', '#B89968', '#5E5F7C', '#D4537E']
  const ALL_DAYS: Array<{ iso: number; label: string }> = [
    { iso: 1, label: '一' },
    { iso: 2, label: '二' },
    { iso: 3, label: '三' },
    { iso: 4, label: '四' },
    { iso: 5, label: '五' },
    { iso: 6, label: '六' },
    { iso: 7, label: '日' },
  ]

  function toggleDay(iso: number) {
    setDays((prev) => (prev.includes(iso) ? prev.filter((x) => x !== iso) : [...prev, iso].sort()))
  }

  async function save() {
    if (!name.trim()) return
    await habitRepo.create({
      name: name.trim(),
      description: '',
      icon,
      color,
      days_of_week: days.length === 7 ? [] : days, // 全选 = 每天 = 空数组
      target_per_day: target,
      archived: false,
    })
    setName('')
    setOpen(false)
  }

  if (!open) {
    return (
      <Button variant="glass" onClick={() => setOpen(true)}>
        + 新建习惯
      </Button>
    )
  }

  return (
    <GlassPanel padding="lg" radius="lg" variant="strong">
      <h3 className="mb-3 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
        新建习惯
      </h3>

      <Input
        placeholder="习惯名称(如:晨跑)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />

      <div className="mt-3">
        <p className="mb-1 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          图标
        </p>
        <div className="flex flex-wrap gap-1">
          {PRESET_ICONS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIcon(i)}
              className="h-8 w-8 rounded-lg text-base transition-all"
              style={{
                background: icon === i ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                border: `0.5px solid ${icon === i ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
              }}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          颜色
        </p>
        <div className="flex gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="h-7 w-7 rounded-full transition-all"
              style={{
                background: c,
                border: `2px solid ${color === c ? 'var(--bn-text-primary)' : 'transparent'}`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          每天目标次数
        </p>
        <input
          type="number"
          min={1}
          value={target}
          onChange={(e) => setTarget(Math.max(1, Number(e.target.value)))}
          className="w-20 rounded-lg px-2 py-1 text-sm bn-mono"
          style={{
            background: 'var(--bn-glass)',
            border: '0.5px solid var(--bn-glass-border)',
            color: 'var(--bn-text-primary)',
          }}
        />
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          目标日(全选 = 每天)
        </p>
        <div className="flex gap-1">
          {ALL_DAYS.map((d) => {
            const active = days.includes(d.iso)
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => toggleDay(d.iso)}
                className="h-8 w-8 rounded-full text-xs transition-all"
                style={{
                  background: active ? 'var(--bn-accent)' : 'var(--bn-glass)',
                  color: active ? '#FFF' : 'var(--bn-text-tertiary)',
                  border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
                }}
              >
                {d.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={save} disabled={!name.trim()}>
          创建
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          取消
        </Button>
      </div>
    </GlassPanel>
  )
}
