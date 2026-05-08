/**
 * 番茄钟引擎(单例)。
 *
 * 设计要点:
 * 1. **跨页面持续**:用户切到分析页/记账页,计时器继续跑(背靠 Worker)
 * 2. **状态持久化**:存到 localStorage,刷新页面恢复
 * 3. **统一通知层**:tab 标题 / 浏览器通知 / 完成音效
 * 4. **不阻塞 UI**:全部异步,通过 listener 模式通知 React
 *
 * 工作模式:
 *   focus(专注 25min) → short_break(5min) → focus → ... → 第 4 个 focus 后是 long_break(15min)
 */

import { focusRepo, settingsRepo } from '@/repositories'
import { fireCompletionConfetti } from '@/lib/confetti'

export type PomodoroMode = 'focus' | 'short_break' | 'long_break'
export type PomodoroStatus = 'idle' | 'running' | 'paused'

export interface PomodoroConfig {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  longBreakEvery: number // 每 N 个 focus 后长休
  autoStartBreak: boolean
  autoStartNextFocus: boolean
  enableNotification: boolean
  enableChime: boolean
  ambientSound: string // 'none' | 'rain' | 'cafe' | 'ocean' | 'fire' | 'forest' | 'whitenoise'
  ambientVolume: number // 0..1
}

export interface PomodoroState {
  status: PomodoroStatus
  mode: PomodoroMode
  remainingMs: number
  totalMs: number
  /** 当前任务(用户输入的描述)*/
  taskName: string
  /** 关联的习惯 id(用于完成时给习惯打卡 +1)*/
  linkedHabitId: string | null
  /** 当前一轮内已完成的 focus 数(0..3,达到 longBreakEvery 时长休)*/
  focusCountInCycle: number
  /** 本次专注时长临时覆盖(分钟)。null 表示用 config.focusMinutes。
   *  完成本轮 focus / 用户 stop 时自动清回 null,只影响"下一次启动" */
  focusOverrideMinutes: number | null
}

export const DEFAULT_CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartBreak: false,
  autoStartNextFocus: false,
  enableNotification: true,
  enableChime: true,
  ambientSound: 'none',
  ambientVolume: 0.4,
}

const STATE_KEY = 'pomodoro_state'
const CONFIG_KEY = 'pomodoro_config'
const TITLE_PREFIX = '板鸭留子 Alive'

type Listener = (state: PomodoroState) => void

class PomodoroEngine {
  private state: PomodoroState = {
    status: 'idle',
    mode: 'focus',
    remainingMs: DEFAULT_CONFIG.focusMinutes * 60 * 1000,
    totalMs: DEFAULT_CONFIG.focusMinutes * 60 * 1000,
    taskName: '',
    linkedHabitId: null,
    focusCountInCycle: 0,
    focusOverrideMinutes: null,
  }
  private config: PomodoroConfig = DEFAULT_CONFIG
  private worker: Worker | null = null
  private listeners = new Set<Listener>()
  /** 当前轮次开始时间,完成时用来写 focus_session */
  private currentSessionStart: string | null = null
  private originalTitle = document.title

  constructor() {
    // 从 localStorage 恢复 config(state 不持久化 — 关页面后默认重置,避免幽灵计时)
    void this.loadConfig()
    this.restoreStateIfRunning()
  }

  // ── 公开 API ─────────────────────────────────────────────────

  getState(): PomodoroState {
    return this.state
  }
  getConfig(): PomodoroConfig {
    return this.config
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l)
    l(this.state)
    return () => this.listeners.delete(l)
  }

  async updateConfig(patch: Partial<PomodoroConfig>): Promise<void> {
    this.config = { ...this.config, ...patch }
    await settingsRepo.setValue(CONFIG_KEY, this.config)
  }

  setTaskInfo(taskName: string, linkedHabitId: string | null): void {
    this.state = { ...this.state, taskName, linkedHabitId }
    this.persist()
    this.notify()
  }

  /**
   * 临时覆盖本次专注时长。
   *
   * 设计：
   *   - 仅在 idle + mode === 'focus' 时生效（运行/休息中改没意义）
   *   - 立刻刷新 remainingMs / totalMs，UI 大数字立刻变
   *   - 启动 → 完成或停止 → 自动清回 null,下次回到 config.focusMinutes
   *   - 传 null 也可以,等于"恢复默认"
   */
  setFocusOverride(minutes: number | null): void {
    if (this.state.status !== 'idle' || this.state.mode !== 'focus') return
    const sanitized = minutes !== null && minutes > 0 && minutes <= 240 ? minutes : null
    this.state = { ...this.state, focusOverrideMinutes: sanitized }
    const totalMs = this.computeTotalForMode('focus')
    this.state = { ...this.state, remainingMs: totalMs, totalMs }
    this.persist()
    this.notify()
  }

  /** 开始当前 mode 的计时 */
  start(): void {
    if (this.state.status === 'running') return
    const endAt = Date.now() + this.state.remainingMs
    this.spawnWorker()
    this.worker!.postMessage({ type: 'start', endAt })
    this.currentSessionStart = new Date().toISOString()
    this.state = { ...this.state, status: 'running' }
    this.persist()
    this.notify()
  }

  pause(): void {
    if (this.state.status !== 'running') return
    this.worker?.postMessage({ type: 'pause' })
    this.state = { ...this.state, status: 'paused' }
    this.persist()
    this.notify()
  }

  resume(): void {
    if (this.state.status !== 'paused') return
    const endAt = Date.now() + this.state.remainingMs
    this.worker?.postMessage({ type: 'resume', endAt })
    this.state = { ...this.state, status: 'running' }
    this.persist()
    this.notify()
  }

  /** 停止并放弃当前轮(不写 focus_session)*/
  stop(): void {
    this.worker?.postMessage({ type: 'stop' })
    this.terminateWorker()
    // 主动停止 → 清掉本次时长覆盖,回到默认
    const clearedState = { ...this.state, focusOverrideMinutes: null }
    this.state = clearedState
    const totalMs = this.computeTotalForMode(this.state.mode)
    this.state = {
      ...this.state,
      status: 'idle',
      remainingMs: totalMs,
      totalMs,
    }
    this.currentSessionStart = null
    this.persist()
    this.restoreTitle()
    this.notify()
  }

  /** 跳到下一阶段(focus → break,break → focus)*/
  skip(): void {
    void this.advance(false)
  }

  // ── 内部 ─────────────────────────────────────────────────────

  private async loadConfig(): Promise<void> {
    const saved = await settingsRepo.getValue<PomodoroConfig>(CONFIG_KEY)
    if (saved) {
      this.config = { ...DEFAULT_CONFIG, ...saved }
      // mode 没改,但持续时间可能变了
      const totalMs = this.computeTotalForMode(this.state.mode)
      if (this.state.status === 'idle') {
        this.state = { ...this.state, remainingMs: totalMs, totalMs }
        this.notify()
      }
    }
  }

  private restoreStateIfRunning(): void {
    // 简化设计:刷新页面后不自动恢复运行(避免和 Worker 状态错位)
    // 用户需要重新点 Start。pomodoro_state 仅用于关闭 tab 后再开仍能记得当前轮次。
    try {
      const raw = localStorage.getItem(STATE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Partial<PomodoroState>
      this.state = {
        ...this.state,
        mode: saved.mode ?? 'focus',
        focusCountInCycle: saved.focusCountInCycle ?? 0,
        taskName: saved.taskName ?? '',
        linkedHabitId: saved.linkedHabitId ?? null,
      }
      const totalMs = this.computeTotalForMode(this.state.mode)
      this.state = { ...this.state, remainingMs: totalMs, totalMs, status: 'idle' }
    } catch {
      // ignore
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        mode: this.state.mode,
        focusCountInCycle: this.state.focusCountInCycle,
        taskName: this.state.taskName,
        linkedHabitId: this.state.linkedHabitId,
      }))
    } catch {
      // quota exceeded etc. — silent fail
    }
  }

  private spawnWorker(): void {
    if (this.worker) return
    this.worker = new Worker('/timer-worker/timer.worker.js')
    this.worker.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'tick') {
        this.state = { ...this.state, remainingMs: msg.remainingMs }
        this.updateTitle()
        this.notify()
      } else if (msg.type === 'done') {
        void this.advance(true)
      }
    }
  }

  private terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }

  private computeTotalForMode(mode: PomodoroMode): number {
    const c = this.config
    switch (mode) {
      case 'focus':
        // 优先用本次临时覆盖,否则用配置默认值
        return (this.state.focusOverrideMinutes ?? c.focusMinutes) * 60 * 1000
      case 'short_break': return c.shortBreakMinutes * 60 * 1000
      case 'long_break': return c.longBreakMinutes * 60 * 1000
    }
  }

  /**
   * 当前阶段结束 / 用户跳过 → 进入下一阶段。
   * @param naturalCompletion true 表示自然倒计时归零(写 focus_session,触发完成动作)
   */
  private async advance(naturalCompletion: boolean): Promise<void> {
    this.terminateWorker()

    // 自然完成 + 是 focus 模式 → 写一条 focus_session
    if (naturalCompletion && this.state.mode === 'focus' && this.currentSessionStart) {
      try {
        await focusRepo.create({
          started_at: this.currentSessionStart,
          ended_at: new Date().toISOString(),
          duration_seconds: Math.round(this.state.totalMs / 1000),
          linked_event_id: null,
          linked_habit_id: this.state.linkedHabitId,
          note: this.state.taskName,
          tag_ids: [],
        })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[pomodoro] failed to record session:', e)
      }
    }

    this.currentSessionStart = null

    // 决定下一阶段
    let nextMode: PomodoroMode
    let nextCount = this.state.focusCountInCycle
    let nextOverride = this.state.focusOverrideMinutes
    if (this.state.mode === 'focus') {
      nextCount += 1
      nextMode = nextCount % this.config.longBreakEvery === 0 ? 'long_break' : 'short_break'
      // focus 结束 → 清掉本次时长覆盖,下一轮 focus 回到默认
      nextOverride = null
    } else {
      nextMode = 'focus'
      if (this.state.mode === 'long_break') nextCount = 0
    }

    // 先把 override 清了再算 totalMs,否则 computeTotalForMode 仍读到旧值
    this.state = { ...this.state, focusOverrideMinutes: nextOverride }
    const totalMs = this.computeTotalForMode(nextMode)
    this.state = {
      ...this.state,
      mode: nextMode,
      remainingMs: totalMs,
      totalMs,
      status: 'idle',
      focusCountInCycle: nextCount,
    }
    this.persist()

    if (naturalCompletion) {
      this.fireCompletionFx()
      // 自动开始下一阶段?
      const shouldAutoStart =
        (nextMode !== 'focus' && this.config.autoStartBreak) ||
        (nextMode === 'focus' && this.config.autoStartNextFocus)
      if (shouldAutoStart) {
        // 延迟一点让用户看到模式切换
        setTimeout(() => this.start(), 1500)
      } else {
        this.restoreTitle()
      }
    } else {
      this.restoreTitle()
    }

    this.notify()
  }

  private fireCompletionFx(): void {
    const c = this.config
    // 注意:advance() 调用本函数时, state.mode 已经切到 nextMode
    // 所以"现在是 break"意味着"刚刚完成了 focus"
    const justFinishedFocus = this.state.mode !== 'focus'

    // 1. 彩带（只在 focus 完成时撒,break 完成不撒,避免疲劳）
    if (justFinishedFocus) {
      try {
        fireCompletionConfetti()
      } catch {
        // ignore — 浏览器不支持也无所谓
      }
    }

    // 2. 通知
    if (c.enableNotification && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const title = justFinishedFocus ? '🍅 一个番茄完成 ✓' : '休息结束 ↻'
        const body = justFinishedFocus
          ? `刚完成的是:${this.state.taskName || '专注'}。要不要休息一下?`
          : '该回到工作了'
        new Notification(title, { body, tag: 'bn_pomodoro' })
      } catch {
        // ignore
      }
    }
    // 3. 完成音效(在 PomodoroPanel 那边弹奏 Audio,因为引擎不持有 Audio 句柄)
    if (c.enableChime) {
      window.dispatchEvent(new CustomEvent('bn:pomodoro:chime'))
    }
  }

  private updateTitle(): void {
    if (this.state.status !== 'running') return
    const mins = Math.floor(this.state.remainingMs / 60000)
    const secs = Math.floor((this.state.remainingMs % 60000) / 1000)
    const tag = this.state.mode === 'focus' ? '🍅' : '☕'
    document.title = `${tag} ${mins}:${String(secs).padStart(2, '0')} · ${TITLE_PREFIX}`
  }

  private restoreTitle(): void {
    document.title = this.originalTitle
  }

  private notify(): void {
    this.listeners.forEach((l) => l(this.state))
  }
}

export const pomodoroEngine = new PomodoroEngine()
