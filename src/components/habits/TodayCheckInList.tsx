import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Minus, Archive } from 'lucide-react'
import { db } from '@/db'
import { habitRepo, habitLogRepo } from '@/repositories'
import { isDayCompleted, isTargetDay, getStreak } from '@/lib/habit-stats'
import { toDayKey } from '@/lib/calendar-utils'
import type { Habit } from '@/types'

/**
 * 今日打卡紧凑列表 —— 替代之前每个习惯独立的 HabitCard。
 *
 * Phase D-1 v2: 真正"合并"
 *   - 一行 = 一个习惯
 *   - 单行 grid: emoji | 名称 + streak | 计数器 +/- | 归档
 *   - 视觉极简,所有月历详情都在 UnifiedHabitCalendar 里
 */
export function TodayCheckInList({ habits }: { habits: Habit[] }) {
  if (habits.length === 0) return null
  const today = new Date()
  const dayKey = toDayKey(today)

  return (
    <div
      className="rounded-xl"
      style={{
        background: 'var(--bn-glass)',
        border: '0.5px solid var(--bn-glass-border)',
      }}
    >
      <div
        className="flex items-baseline justify-between px-4 pb-1.5 pt-3"
      >
        <span
          className="uppercase"
          style={{
            fontSize: 'var(--bn-text-xs)',
            color: 'var(--bn-text-secondary)',
            letterSpacing: '0.08em',
            fontWeight: 600,
          }}
        >
          今日打卡
        </span>
        <span style={{ fontSize: 'var(--bn-text-xs)', color: 'var(--bn-text-tertiary)' }}>
          {today.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
        </span>
      </div>
      <div>
        {habits.map((h, i) => (
          <CheckInRow
            key={h.id}
            habit={h}
            today={today}
            dayKey={dayKey}
            isLast={i === habits.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

function CheckInRow({
  habit,
  today,
  dayKey,
  isLast,
}: {
  habit: Habit
  today: Date
  dayKey: string
  isLast: boolean
}) {
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
  useEffect(() => {
    void getStreak(habit).then(setStreak)
  }, [habit, todayLog])

  const targetToday = isTargetDay(habit, today)
  const completedToday = isDayCompleted(habit, todayLog ?? null)
  const count = todayLog?.count ?? 0

  async function inc() {
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
  async function dec() {
    if (!todayLog || todayLog.count <= 0) return
    if (todayLog.count === 1) {
      await habitLogRepo.softDelete(todayLog.id)
    } else {
      await habitLogRepo.update(todayLog.id, { count: todayLog.count - 1 })
    }
  }
  async function archive() {
    if (!confirm(`归档习惯 "${habit.name}"?`)) return
    await habitRepo.update(habit.id, { archived: true })
  }

  return (
    <div
      className="group flex items-center gap-2.5 px-4 py-2.5"
      style={{
        borderTop: '0.5px solid var(--bn-row-border)',
        ...(isLast ? { borderRadius: '0 0 12px 12px' } : {}),
        opacity: targetToday ? 1 : 0.55,
      }}
    >
      {/* emoji */}
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: completedToday ? `${habit.color}30` : 'var(--bn-glass-strong)',
          border: `0.5px solid ${completedToday ? habit.color : 'var(--bn-glass-border)'}`,
          fontSize: 14,
        }}
      >
        {habit.icon || '✦'}
      </span>

      {/* 名字 + streak（一列堆叠） */}
      <div className="min-w-0 flex-1">
        <div
          className="truncate"
          style={{
            fontSize: 'var(--bn-text-sm)',
            fontWeight: 500,
            color: 'var(--bn-text-primary)',
            letterSpacing: '-0.005em',
          }}
        >
          {habit.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--bn-text-tertiary)', marginTop: 1 }}>
          🔥 {streak} 天
          {!targetToday && (
            <span style={{ marginLeft: 6, opacity: 0.7 }}>· 今天非目标日</span>
          )}
        </div>
      </div>

      {/* 计数器 */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => void dec()}
          disabled={count === 0}
          aria-label="减"
          className="flex h-7 w-7 items-center justify-center rounded-full transition-all disabled:opacity-25"
          style={{
            background: 'var(--bn-glass-strong)',
            border: '0.5px solid var(--bn-glass-border)',
            color: 'var(--bn-text-secondary)',
          }}
        >
          <Minus size={12} strokeWidth={2.4} />
        </button>
        <span
          className="bn-mono w-12 text-center"
          style={{
            fontSize: 'var(--bn-text-sm)',
            fontWeight: 600,
            color: completedToday ? habit.color : 'var(--bn-text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count}/{habit.target_per_day}
        </span>
        <button
          type="button"
          onClick={() => void inc()}
          aria-label="加"
          className="flex h-7 w-7 items-center justify-center rounded-full transition-all hover:scale-105"
          style={{
            background: completedToday ? habit.color : 'var(--bn-accent)',
            color: completedToday ? '#FFF' : 'var(--bn-button-fg)',
            border: 'none',
          }}
        >
          <Plus size={12} strokeWidth={2.4} />
        </button>
      </div>

      {/* 归档 */}
      <button
        type="button"
        onClick={() => void archive()}
        aria-label="归档"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-60"
        style={{ color: 'var(--bn-text-tertiary)' }}
        title="归档"
      >
        <Archive size={12} strokeWidth={2} />
      </button>
    </div>
  )
}
