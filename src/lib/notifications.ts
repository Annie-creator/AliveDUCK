/**
 * 浏览器通知封装。
 *
 * 提醒的工作方式:
 * 1. 用户首次创建带提醒的事件时,自动询问通知权限
 * 2. 应用启动时扫一遍未来 24 小时内的提醒,setTimeout 注册
 * 3. 每次新增/修改事件,重新扫一遍(不做精细 diff)
 *
 * 局限:页面关闭后通知不工作。Phase 6 上 Service Worker 后才能后台通知。
 * 当前阶段策略:**用户保持页面打开就能用**,关闭就退化为纯日历视图。
 */

import { calendarRepo } from '@/repositories'

/** 询问通知权限(idempotent)*/
export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied'
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission
  }
  return await Notification.requestPermission()
}

/** 当前权限状态(同步)*/
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

const scheduledTimers = new Map<string, ReturnType<typeof setTimeout>[]>()

/** 清除全部 */
export function clearAllScheduledReminders(): void {
  for (const timers of scheduledTimers.values()) {
    for (const t of timers) clearTimeout(t)
  }
  scheduledTimers.clear()
}

/**
 * 重新扫一遍未来 24 小时内的事件,注册提醒 timer。
 * 应用启动 / 事件增删改后调用。
 */
export async function rescheduleUpcomingReminders(): Promise<void> {
  if (getNotificationPermission() !== 'granted') return
  clearAllScheduledReminders()

  const now = Date.now()
  const horizon = now + 24 * 60 * 60 * 1000 // 24h

  const events = await calendarRepo.listInRange(
    new Date(now).toISOString(),
    new Date(horizon).toISOString(),
  )

  for (const ev of events) {
    if (!ev.reminders_minutes || ev.reminders_minutes.length === 0) continue
    const startMs = Date.parse(ev.start_at)
    const timers: ReturnType<typeof setTimeout>[] = []

    for (const minBefore of ev.reminders_minutes) {
      const fireAt = startMs - minBefore * 60_000
      if (fireAt <= now) continue // 已过去的不补
      if (fireAt > horizon) continue // 超出监控窗口

      const delay = fireAt - now
      timers.push(
        setTimeout(() => {
          showNotification(ev.title, {
            body:
              ev.description ||
              `${minBefore === 0 ? '现在开始' : `${minBefore} 分钟后开始`} · ${
                ev.location || '无地点'
              }`,
            tag: `bn_event_${ev.id}_${minBefore}`,
          })
        }, delay),
      )
    }

    if (timers.length > 0) scheduledTimers.set(ev.id, timers)
  }
}

function showNotification(title: string, opts: NotificationOptions): void {
  if (getNotificationPermission() !== 'granted') return
  try {
    new Notification(title, opts)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[notify] failed:', e)
  }
}
