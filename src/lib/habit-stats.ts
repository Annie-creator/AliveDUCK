/**
 * 习惯统计工具。
 *
 * 关键概念:
 * - **目标日**:习惯的 days_of_week 决定哪些天该打卡(空数组 = 每天都要)
 * - **完成**:某天的打卡 count >= target_per_day
 * - **连续天数 (streak)**:从今天倒推,连续完成的目标日数
 *   非目标日不打断连续,但也不计入连续天数
 */

import { db } from '@/db'
import type { Habit, HabitLog } from '@/types'
import { toDayKey } from './calendar-utils'

/** 今天是否是该习惯的目标日 */
export function isTargetDay(habit: Habit, day: Date): boolean {
  if (!habit.days_of_week || habit.days_of_week.length === 0) return true
  // days_of_week 用 1..7 表示周一到周日(ISO)
  const isoDow = ((day.getDay() + 6) % 7) + 1
  return habit.days_of_week.includes(isoDow)
}

/** 当天是否完成 */
export function isDayCompleted(
  habit: Habit,
  log: HabitLog | null | undefined,
): boolean {
  if (!log || log.deleted_at) return false
  return log.count >= habit.target_per_day
}

/** 计算 streak(从今天倒推)*/
export async function getStreak(habit: Habit): Promise<number> {
  const today = new Date()
  let streak = 0
  const cur = new Date(today)

  // 至多回看 365 天,够大也不离谱
  for (let i = 0; i < 365; i++) {
    if (isTargetDay(habit, cur)) {
      const log = await db.habit_logs
        .where('[habit_id+date]')
        .equals([habit.id, toDayKey(cur)])
        .filter((l) => !l.deleted_at)
        .first()
      if (isDayCompleted(habit, log)) {
        streak++
      } else {
        // 今天还没打也不算断(给当前一天的余地)
        if (i === 0) {
          // pass — 不递增 streak,但继续往前看
        } else {
          break
        }
      }
    }
    cur.setDate(cur.getDate() - 1)
  }
  return streak
}

/** 月内完成率(完成天数 / 该月目标天数)*/
export async function getMonthCompletion(
  habit: Habit,
  reference: Date = new Date(),
): Promise<{ completed: number; targetDays: number }> {
  const year = reference.getFullYear()
  const month = reference.getMonth()
  const today = new Date()
  const lastDay = new Date(year, month + 1, 0).getDate()
  // 仅算到今天为止(未来的目标日不计)
  const upto = isSameMonth(reference, today) ? today.getDate() : lastDay

  let target = 0
  let completed = 0

  for (let d = 1; d <= upto; d++) {
    const day = new Date(year, month, d)
    if (!isTargetDay(habit, day)) continue
    target++
    const log = await db.habit_logs
      .where('[habit_id+date]')
      .equals([habit.id, toDayKey(day)])
      .filter((l) => !l.deleted_at)
      .first()
    if (isDayCompleted(habit, log)) completed++
  }

  return { completed, targetDays: target }
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}
