/**
 * UI 偏好设置 store —— 比 ThemeProvider 更轻量。
 *
 * 用 React 18 的 useSyncExternalStore，跨组件同步 + 跨标签页同步（监听 storage 事件）。
 *
 * 加新偏好的步骤:
 *  1. 起一个 STORAGE_KEY 常量
 *  2. 加一个 readXxx() 默认值函数
 *  3. 在 store 里加字段
 *  4. 暴露 useXxx hook
 */

import { useSyncExternalStore } from 'react'

// ── 偏好类型 ────────────────────────────────────────────
export type FontScale = 'small' | 'medium' | 'large'

interface Preferences {
  /** 一键支出高亮：开则所有支出金额变红 */
  expenseHighlight: boolean
  /** 全局字体大小档位 */
  fontScale: FontScale
  /** 启动欢迎页冷却时间(小时);0 表示关闭欢迎页 */
  welcomeCooldownHours: number
}

const DEFAULTS: Preferences = {
  expenseHighlight: false,
  fontScale: 'medium',
  welcomeCooldownHours: 6,
}

const STORAGE_KEYS: Record<keyof Preferences, string> = {
  expenseHighlight: 'banya_pref_expense_highlight',
  fontScale: 'banya_pref_font_scale',
  welcomeCooldownHours: 'banya_pref_welcome_cooldown_hours',
}

// ── 读取/写入 ──────────────────────────────────────────
function read<K extends keyof Preferences>(key: K): Preferences[K] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[key])
    if (raw === null) return DEFAULTS[key]
    if (typeof DEFAULTS[key] === 'boolean') {
      return (raw === '1') as Preferences[K]
    }
    return JSON.parse(raw) as Preferences[K]
  } catch {
    return DEFAULTS[key]
  }
}

function write<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  try {
    if (typeof value === 'boolean') {
      localStorage.setItem(STORAGE_KEYS[key], value ? '1' : '0')
    } else {
      localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value))
    }
  } catch {
    // localStorage 不可用,忽略
  }
}

// ── store ─────────────────────────────────────────────
let state: Preferences = {
  expenseHighlight: read('expenseHighlight'),
  fontScale: read('fontScale'),
  welcomeCooldownHours: read('welcomeCooldownHours'),
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  listeners.forEach((l) => l())
}

// 跨标签页同步:监听 storage 事件
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key) return
    for (const [k, sk] of Object.entries(STORAGE_KEYS) as Array<
      [keyof Preferences, string]
    >) {
      if (e.key === sk) {
        state = { ...state, [k]: read(k) }
        notify()
      }
    }
  })
}

// ── 通用 setter ────────────────────────────────────────
export function setPreference<K extends keyof Preferences>(
  key: K,
  value: Preferences[K],
): void {
  if (state[key] === value) return
  state = { ...state, [key]: value }
  write(key, value)
  notify()
}

// ── hooks ─────────────────────────────────────────────
export function useExpenseHighlight(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(
    subscribe,
    () => state.expenseHighlight,
    () => DEFAULTS.expenseHighlight,
  )
  return [v, (next: boolean) => setPreference('expenseHighlight', next)]
}

export function useFontScale(): [FontScale, (v: FontScale) => void] {
  const v = useSyncExternalStore(
    subscribe,
    () => state.fontScale,
    () => DEFAULTS.fontScale,
  )
  return [v, (next: FontScale) => setPreference('fontScale', next)]
}

export function useWelcomeCooldownHours(): [number, (v: number) => void] {
  const v = useSyncExternalStore(
    subscribe,
    () => state.welcomeCooldownHours,
    () => DEFAULTS.welcomeCooldownHours,
  )
  return [v, (next: number) => setPreference('welcomeCooldownHours', next)]
}

/** 非 hook 版本,给非 React 上下文用(如 WelcomeSplash 模块顶层) */
export function getWelcomeCooldownHours(): number {
  return state.welcomeCooldownHours
}
