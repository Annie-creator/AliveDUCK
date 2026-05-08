import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { db } from '@/db'
import { GlassPanel } from '@/components/ui/GlassPanel'
import {
  monthGrid,
  toDayKey,
  isSameMonth,
  isSameDay,
  CN_WEEKDAYS_MON,
  CN_MONTHS,
} from '@/lib/calendar-utils'
import { isDayCompleted, isTargetDay } from '@/lib/habit-stats'
import type { Habit, HabitLog } from '@/types'

/**
 * 统一习惯月历 —— Phase D-1。
 *
 * 设计契约（来自 Annie 原话:"各个习惯放一块,一格显示当天完成的所有 emoji"）：
 *   - 单个月历视图,所有习惯共享
 *   - 每个日期格:左上角小数字日期,正文显示当天完成的习惯 emoji
 *   - emoji 最多显示 4 个（2x2 网格）,超过则末位换成 +N
 *   - 点击格子展开当天明细面板:列出所有习惯今天的状态
 *   - 上下月切换;非本月日变淡;今天加 accent 边框
 */
export function UnifiedHabitCalendar({ habits }: { habits: Habit[] }) {
  const today = new Date()
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const cells = useMemo(() => monthGrid(cursor), [cursor])
  const startKey = toDayKey(cells[0]!)
  const endKey = toDayKey(cells[41]!)

  // 拉本月窗口内所有 habit_logs（一次查全部,客户端按 habit_id 分组）
  const logs = useLiveQuery(
    () =>
      db.habit_logs
        .filter((l) => !l.deleted_at && l.date >= startKey && l.date <= endKey)
        .toArray(),
    [startKey, endKey],
    [],
  )

  // 按 (date, habit_id) 索引
  const logsByDateAndHabit = useMemo(() => {
    const map = new Map<string, Map<string, HabitLog>>()
    for (const log of logs ?? []) {
      let inner = map.get(log.date)
      if (!inner) {
        inner = new Map()
        map.set(log.date, inner)
      }
      inner.set(log.habit_id, log)
    }
    return map
  }, [logs])

  function getCompletedForDay(day: Date): Habit[] {
    const k = toDayKey(day)
    const dayLogs = logsByDateAndHabit.get(k)
    if (!dayLogs) return []
    return habits.filter((h) => {
      const log = dayLogs.get(h.id)
      return log ? isDayCompleted(h, log) : false
    })
  }

  function prevMonth() {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
  }
  function nextMonth() {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
  }
  function gotoToday() {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedKey(toDayKey(today))
  }

  return (
    <GlassPanel padding="lg" radius="lg" variant="strong">
      {/* 月份切换栏 */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="上个月"
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: 'var(--bn-text-secondary)' }}
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <div className="flex items-baseline gap-2">
          <h2
            style={{
              fontSize: 'var(--bn-text-md)',
              fontWeight: 600,
              color: 'var(--bn-text-primary)',
              letterSpacing: '-0.015em',
            }}
          >
            {cursor.getFullYear()} 年 {CN_MONTHS[cursor.getMonth()]}
          </h2>
          {!isSameMonth(cursor, today) && (
            <button
              type="button"
              onClick={gotoToday}
              className="rounded-md px-1.5 py-0.5 text-[10px] transition-colors hover:bg-white/5"
              style={{ color: 'var(--bn-text-tertiary)' }}
            >
              回到今天
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="下个月"
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: 'var(--bn-text-secondary)' }}
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>

      {/* 周标题 */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {CN_WEEKDAYS_MON.map((w) => (
          <div
            key={w}
            className="text-center"
            style={{
              fontSize: 10,
              color: 'var(--bn-text-tertiary)',
              fontWeight: 500,
              letterSpacing: '0.04em',
            }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 月历格子 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const k = toDayKey(d)
          const inMonth = isSameMonth(d, cursor)
          const isToday = isSameDay(d, today)
          const isSelected = selectedKey === k
          const isFuture = d > today && !isSameDay(d, today)
          const completed = getCompletedForDay(d)

          return (
            <button
              key={k}
              type="button"
              onClick={() => setSelectedKey(isSelected ? null : k)}
              className="relative overflow-hidden rounded-lg p-1 transition-all"
              style={{
                aspectRatio: '1 / 1',
                background: isSelected
                  ? 'var(--bn-glass-strong)'
                  : completed.length > 0
                    ? 'var(--bn-glass)'
                    : 'transparent',
                border: isToday
                  ? '1.5px solid var(--bn-accent)'
                  : isSelected
                    ? '0.5px solid var(--bn-accent)'
                    : '0.5px solid var(--bn-glass-border)',
                opacity: inMonth ? (isFuture ? 0.5 : 1) : 0.25,
                cursor: 'pointer',
              }}
            >
              {/* 日期角标 */}
              <span
                className="absolute left-1 top-0.5"
                style={{
                  fontSize: 10,
                  color: isToday ? 'var(--bn-accent)' : 'var(--bn-text-tertiary)',
                  fontWeight: isToday ? 700 : 500,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {d.getDate()}
              </span>

              {/* emoji 网格 */}
              <DayEmojis habits={completed} />
            </button>
          )
        })}
      </div>

      {/* 选中日详情 */}
      {selectedKey && (
        <SelectedDayDetail
          dayKey={selectedKey}
          dayLogs={logsByDateAndHabit.get(selectedKey) ?? new Map()}
          habits={habits}
          onClose={() => setSelectedKey(null)}
        />
      )}

      {/* 月度小计 */}
      <MonthlyFootnote habits={habits} logsByDate={logsByDateAndHabit} cells={cells} />
    </GlassPanel>
  )
}

/* ── 单格的 emoji 排布 ───────────────────────────── */
function DayEmojis({ habits }: { habits: Habit[] }) {
  if (habits.length === 0) return null

  const visible = habits.slice(0, 4)
  const overflow = habits.length - 4

  return (
    <div
      className="absolute inset-x-0.5 bottom-0.5 grid"
      style={{
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 1,
      }}
    >
      {visible.map((h, i) => {
        // 第 4 格如果有溢出,显示 +N 而不是 emoji
        if (i === 3 && overflow > 0) {
          return (
            <span
              key="overflow"
              className="bn-mono flex items-center justify-center rounded"
              style={{
                fontSize: 9,
                color: 'var(--bn-text-secondary)',
                background: 'var(--bn-glass-strong)',
                fontWeight: 600,
                aspectRatio: '1 / 1',
              }}
            >
              +{overflow + 1}
            </span>
          )
        }
        return (
          <span
            key={h.id}
            className="flex items-center justify-center rounded"
            style={{
              fontSize: 12,
              background: `${h.color}25`,
              border: `0.5px solid ${h.color}55`,
              aspectRatio: '1 / 1',
              lineHeight: 1,
            }}
            title={h.name}
          >
            {h.icon || '✦'}
          </span>
        )
      })}
    </div>
  )
}

/* ── 选中某天的明细面板 ──────────────────────────── */
function SelectedDayDetail({
  dayKey,
  dayLogs,
  habits,
  onClose,
}: {
  dayKey: string
  dayLogs: Map<string, HabitLog>
  habits: Habit[]
  onClose: () => void
}) {
  const date = new Date(dayKey + 'T00:00:00')
  const dateLabel = date.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  const completed = habits.filter((h) => {
    const log = dayLogs.get(h.id)
    return log ? isDayCompleted(h, log) : false
  })
  const targetButNotDone = habits.filter((h) => {
    if (!isTargetDay(h, date)) return false
    const log = dayLogs.get(h.id)
    return !log || !isDayCompleted(h, log)
  })

  return (
    <div
      className="mt-4 rounded-xl px-4 py-3"
      style={{
        background: 'var(--bn-glass)',
        border: '0.5px solid var(--bn-glass-border)',
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          style={{
            fontSize: 'var(--bn-text-sm)',
            fontWeight: 600,
            color: 'var(--bn-text-primary)',
            letterSpacing: '-0.005em',
          }}
        >
          {dateLabel}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: 'var(--bn-text-tertiary)' }}
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>

      {completed.length > 0 && (
        <div className="mb-2">
          <p
            className="mb-1 uppercase"
            style={{
              fontSize: 10,
              color: 'var(--bn-text-tertiary)',
              letterSpacing: '0.06em',
            }}
          >
            完成 ({completed.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {completed.map((h) => {
              const log = dayLogs.get(h.id)
              return (
                <span
                  key={h.id}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5"
                  style={{
                    background: `${h.color}25`,
                    border: `0.5px solid ${h.color}55`,
                    color: 'var(--bn-text-primary)',
                    fontSize: 11,
                  }}
                >
                  <span>{h.icon || '✦'}</span>
                  <span>{h.name}</span>
                  <span
                    className="bn-mono"
                    style={{ color: 'var(--bn-text-tertiary)', fontWeight: 600 }}
                  >
                    {log?.count ?? 0}
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {targetButNotDone.length > 0 && (
        <div>
          <p
            className="mb-1 uppercase"
            style={{
              fontSize: 10,
              color: 'var(--bn-text-tertiary)',
              letterSpacing: '0.06em',
            }}
          >
            未完成 ({targetButNotDone.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {targetButNotDone.map((h) => {
              const log = dayLogs.get(h.id)
              return (
                <span
                  key={h.id}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5"
                  style={{
                    background: 'var(--bn-glass-strong)',
                    border: '0.5px dashed var(--bn-glass-border)',
                    color: 'var(--bn-text-tertiary)',
                    fontSize: 11,
                  }}
                >
                  <span style={{ opacity: 0.5 }}>{h.icon || '✦'}</span>
                  <span>{h.name}</span>
                  <span className="bn-mono" style={{ fontWeight: 600 }}>
                    {log?.count ?? 0} / {h.target_per_day}
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {completed.length === 0 && targetButNotDone.length === 0 && (
        <p style={{ fontSize: 'var(--bn-text-sm)', color: 'var(--bn-text-tertiary)' }}>
          这天没有目标习惯。
        </p>
      )}
    </div>
  )
}

/* ── 月度脚注：本月各习惯完成天数 ─────────────────── */
function MonthlyFootnote({
  habits,
  logsByDate,
  cells,
}: {
  habits: Habit[]
  logsByDate: Map<string, Map<string, HabitLog>>
  cells: Date[]
}) {
  // 只统计本月的天（cells 含上下月填充）
  const month = cells[15]?.getMonth() // cell 15 一定在本月
  if (month === undefined) return null

  const completionByHabit = habits.map((h) => {
    let count = 0
    for (const day of cells) {
      if (day.getMonth() !== month) continue
      const log = logsByDate.get(toDayKey(day))?.get(h.id)
      if (log && isDayCompleted(h, log)) count += 1
    }
    return { habit: h, count }
  })

  if (completionByHabit.every((x) => x.count === 0)) return null

  return (
    <div
      className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3"
      style={{ borderColor: 'var(--bn-row-border)' }}
    >
      <span
        className="uppercase"
        style={{
          fontSize: 10,
          color: 'var(--bn-text-tertiary)',
          letterSpacing: '0.06em',
        }}
      >
        本月
      </span>
      {completionByHabit
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count)
        .map(({ habit, count }) => (
          <span
            key={habit.id}
            className="flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{
              background: 'var(--bn-glass)',
              fontSize: 11,
              color: 'var(--bn-text-secondary)',
            }}
          >
            <span>{habit.icon || '✦'}</span>
            <span
              className="bn-mono"
              style={{ color: habit.color, fontWeight: 600 }}
            >
              {count}
            </span>
          </span>
        ))}
    </div>
  )
}
