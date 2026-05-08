/**
 * 八段锦完成记录 store。
 *
 * 设计决策：
 *  - 不进 IndexedDB，直接用 localStorage —— 数据量极小（每天 1 条），不需要走同步引擎
 *  - 记录两件事：completed（做了）/ dismissed（今日跳过）
 *  - 完成 ≠ 跳过：跳过只是让今天不再弹卡片，不算"做了"
 *  - 用本地日期 YYYY-MM-DD 作为 key，避免时区跨天问题
 */

import { useSyncExternalStore } from 'react'

const KEY_COMPLETED = 'banya_baduanjin_completed'
const KEY_DISMISSED = 'banya_baduanjin_dismissed'

export interface BaduanjinStats {
  /** 已完成的日期，YYYY-MM-DD 格式 */
  completedDates: string[]
  /** 今日是否已跳过（仅当天有效） */
  dismissedToday: boolean
  /** 今日是否已完成 */
  completedToday: boolean
  /** 累计完成次数 */
  totalCompleted: number
  /** 当前连续完成天数 */
  streak: number
}

function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function readCompleted(): string[] {
  try {
    const raw = localStorage.getItem(KEY_COMPLETED)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(KEY_DISMISSED)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function calcStreak(dates: string[]): number {
  if (dates.length === 0) return 0
  const set = new Set(dates)
  let streak = 0
  // 从今天向前数
  const cursor = new Date()
  // 如果今天还没做但昨天做了，仍然算昨天的连续
  if (!set.has(todayStr())) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (true) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    const key = `${y}-${m}-${d}`
    if (set.has(key)) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

function compute(): BaduanjinStats {
  const completedDates = readCompleted()
  const dismissedDates = readDismissed()
  const today = todayStr()
  return {
    completedDates,
    completedToday: completedDates.includes(today),
    dismissedToday: dismissedDates.includes(today),
    totalCompleted: completedDates.length,
    streak: calcStreak(completedDates),
  }
}

let state: BaduanjinStats = compute()

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  state = compute()
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY_COMPLETED || e.key === KEY_DISMISSED) {
      notify()
    }
  })
}

/** 标记今日已完成（不重复添加） */
export function markBaduanjinDone(): void {
  const today = todayStr()
  const list = readCompleted()
  if (list.includes(today)) return
  list.push(today)
  try {
    localStorage.setItem(KEY_COMPLETED, JSON.stringify(list))
  } catch {
    // 无所谓
  }
  notify()
}

/** 今日跳过（不再弹卡片，明天再说） */
export function dismissBaduanjinToday(): void {
  const today = todayStr()
  const list = readDismissed()
  if (list.includes(today)) return
  list.push(today)
  // 只保留最近 14 天 dismiss 记录，防膨胀
  const recent = list.slice(-14)
  try {
    localStorage.setItem(KEY_DISMISSED, JSON.stringify(recent))
  } catch {
    // 无所谓
  }
  notify()
}

export function useBaduanjinStats(): BaduanjinStats {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

/* ── 八段锦每日动作排程 ────────────────────────────────
 *  按周一到周日循环，每天 1 个动作。
 *  第 8 式（"背后七颠"）作为周日的"加餐"和第 7 式合并。
 *  动作名是非物质文化遗产标准译法。
 */
export interface BaduanjinMove {
  index: number
  /** 全名 */
  name: string
  /** 一句话功效 */
  benefit: string
}

export const BADUANJIN_MOVES: BaduanjinMove[] = [
  { index: 1, name: '双手托天理三焦', benefit: '舒展三焦 · 改善肩颈僵硬' },
  { index: 2, name: '左右开弓似射雕', benefit: '舒展胸肺 · 强化上肢' },
  { index: 3, name: '调理脾胃须单举', benefit: '理气和胃 · 改善消化' },
  { index: 4, name: '五劳七伤往后瞧', benefit: '疏通颈椎 · 缓解久坐' },
  { index: 5, name: '摇头摆尾去心火', benefit: '宁心降火 · 调节情绪' },
  { index: 6, name: '两手攀足固肾腰', benefit: '强健腰肾 · 拉伸后链' },
  { index: 7, name: '攒拳怒目增气力', benefit: '增气养神 · 振奋精神' },
  { index: 8, name: '背后七颠百病消', benefit: '震荡督脉 · 收尾整体' },
]

/** 取今日推荐动作（按周几循环，周日轮第 7+8 式） */
export function getTodayMove(): BaduanjinMove {
  const day = new Date().getDay() // 0=周日, 1=周一, ..., 6=周六
  // 周一(1) → 第 1 式, ..., 周六(6) → 第 6 式, 周日(0) → 第 7 式
  const idx = day === 0 ? 6 : day - 1
  return BADUANJIN_MOVES[idx]
}
