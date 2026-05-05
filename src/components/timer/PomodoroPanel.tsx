import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  pomodoroEngine,
  DEFAULT_CONFIG,
  type PomodoroState,
  type PomodoroConfig,
} from '@/lib/pomodoro-engine'
import {
  AMBIENT_SOUNDS,
  LEGACY_BILIBILI_BGM,
  ambientPlayer,
  playChime,
} from '@/lib/ambient-sound'
import { closePip, isPipOpen, isPipSupported, openPip, sendPipUpdate } from '@/lib/pip-window'
import { ensureNotificationPermission } from '@/lib/notifications'
import { resolveTimeRange } from '@/lib/finance-stats'
import type { Habit } from '@/types'

export function PomodoroPanel() {
  const [state, setState] = useState<PomodoroState>(pomodoroEngine.getState())
  const [config, setConfig] = useState<PomodoroConfig>(pomodoroEngine.getConfig())
  const [showConfig, setShowConfig] = useState(false)
  const [pipOpen, setPipOpen] = useState(isPipOpen())

  // 订阅引擎
  useEffect(() => pomodoroEngine.subscribe(setState), [])

  // 完成铃声(引擎触发自定义事件,这里弹奏)
  useEffect(() => {
    const handler = () => playChime(0.6)
    window.addEventListener('bn:pomodoro:chime', handler)
    return () => window.removeEventListener('bn:pomodoro:chime', handler)
  }, [])

  // PiP 更新
  useEffect(() => {
    if (pipOpen) {
      sendPipUpdate({
        remainingMs: state.remainingMs,
        totalMs: state.totalMs,
        mode: state.mode,
        status: state.status,
        taskName: state.taskName,
      })
    }
  }, [state, pipOpen])

  // 状态切换时联动环境音
  useEffect(() => {
    if (state.status === 'running' && config.ambientSound !== 'none') {
      ambientPlayer.setSound(config.ambientSound, config.ambientVolume)
    } else if (state.status === 'paused') {
      ambientPlayer.pause()
    } else if (state.status === 'idle') {
      ambientPlayer.stop()
    }
  }, [state.status, config.ambientSound, config.ambientVolume])

  // 注册通知权限(用户首次点开始时)
  async function ensurePerms() {
    if (config.enableNotification) {
      await ensureNotificationPermission()
    }
  }

  // ── 派生展示数据 ──────────────────────────────────────
  const minutes = Math.floor(state.remainingMs / 60000)
  const seconds = Math.floor((state.remainingMs % 60000) / 1000)
  const progress = state.totalMs > 0 ? 1 - state.remainingMs / state.totalMs : 0

  const modeLabel = state.mode === 'focus' ? '专注'
    : state.mode === 'short_break' ? '短休'
      : '长休'
  const modeColor = state.mode === 'focus'
    ? 'var(--bn-accent)'
    : 'var(--bn-positive)'

  // 关联习惯下拉
  const habits = useLiveQuery(
    () => db.habits.filter((h) => !h.deleted_at && !h.archived).toArray(),
    [],
    [] as Habit[],
  )

  // 今日 focus_sessions 汇总
  const todayRange = useMemo(() => resolveTimeRange('this_week'), []) // 不用,改 day
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayEnd = new Date(todayStart.getTime() + 86_400_000)

  const todaySessions = useLiveQuery(
    () =>
      db.focus_sessions
        .filter(
          (s) =>
            !s.deleted_at &&
            s.started_at >= todayStart.toISOString() &&
            s.started_at < todayEnd.toISOString(),
        )
        .toArray(),
    [todayStart.toISOString()],
    [],
  )

  const todayMinutes = (todaySessions ?? []).reduce(
    (s, x) => s + Math.round(x.duration_seconds / 60),
    0,
  )
  void todayRange // 防 lint

  // ── 操作 ─────────────────────────────────────────────
  function handleStartOrPause() {
    void ensurePerms()
    if (state.status === 'running') {
      pomodoroEngine.pause()
      ambientPlayer.pause()
    } else if (state.status === 'paused') {
      pomodoroEngine.resume()
      ambientPlayer.resume()
    } else {
      pomodoroEngine.start()
      if (config.ambientSound !== 'none') {
        ambientPlayer.setSound(config.ambientSound, config.ambientVolume)
      }
    }
  }

  function handleStop() {
    pomodoroEngine.stop()
    ambientPlayer.stop()
  }

  function handleSkip() {
    pomodoroEngine.skip()
  }

  async function togglePip() {
    if (pipOpen) {
      closePip()
      setPipOpen(false)
      return
    }
    const ok = await openPip(
      {
        remainingMs: state.remainingMs,
        totalMs: state.totalMs,
        mode: state.mode,
        status: state.status,
        taskName: state.taskName,
      },
      (action) => {
        if (action === 'toggle') handleStartOrPause()
        else if (action === 'stop') handleStop()
      },
    )
    setPipOpen(ok)
  }

  function handleTaskChange(name: string) {
    pomodoroEngine.setTaskInfo(name, state.linkedHabitId)
  }
  function handleHabitChange(habitId: string | null) {
    pomodoroEngine.setTaskInfo(state.taskName, habitId)
  }

  async function updateConfig(patch: Partial<PomodoroConfig>) {
    await pomodoroEngine.updateConfig(patch)
    setConfig({ ...config, ...patch })
  }

  return (
    <div className="space-y-4">
      {/* 任务输入 */}
      <GlassPanel padding="md" radius="lg">
        <p className="mb-1.5 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          当前任务
        </p>
        <Input
          placeholder="比如:看完那篇 paper 第 3 节"
          value={state.taskName}
          onChange={(e) => handleTaskChange(e.target.value)}
        />
        {(habits ?? []).length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wider"
              style={{ color: 'var(--bn-text-tertiary)' }}>
              关联习惯(可选)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(habits ?? []).map((h) => {
                const active = state.linkedHabitId === h.id
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => handleHabitChange(active ? null : h.id)}
                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-all"
                    style={{
                      background: active ? `${h.color}30` : 'var(--bn-glass)',
                      color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
                      border: `0.5px solid ${active ? h.color : 'var(--bn-glass-border)'}`,
                    }}
                  >
                    <span>{h.icon || '✦'}</span>
                    <span>{h.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </GlassPanel>

      {/* 大数字显示 */}
      <GlassPanel padding="lg" radius="lg" variant="strong">
        <div className="text-center">
          <p className="mb-2 text-[11px] uppercase tracking-[0.15em]"
            style={{ color: modeColor, fontWeight: 500 }}>
            {modeLabel} · 第 {state.focusCountInCycle + (state.mode === 'focus' ? 1 : 0)} 个
          </p>
          <div
            className="bn-mono mb-3 text-[80px] leading-none"
            style={{
              color: 'var(--bn-text-primary)',
              fontWeight: 300,
              letterSpacing: '-0.04em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {minutes}:{String(seconds).padStart(2, '0')}
          </div>

          {/* 进度条 */}
          <div className="mx-auto mb-4 h-1 w-3/4 overflow-hidden rounded-full"
            style={{ background: 'var(--bn-glass)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress * 100}%`,
                background: modeColor,
              }}
            />
          </div>

          {/* 控制 */}
          <div className="flex items-center justify-center gap-2">
            <Button onClick={handleStartOrPause} size="lg">
              {state.status === 'running' ? '暂停' : state.status === 'paused' ? '继续' : '开始'}
            </Button>
            {state.status !== 'idle' && (
              <Button variant="glass" onClick={handleStop}>停止</Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleSkip}>跳过</Button>
            {isPipSupported() && (
              <Button variant="ghost" size="sm" onClick={togglePip}>
                {pipOpen ? '关闭浮窗' : '↗ 弹出浮窗'}
              </Button>
            )}
          </div>
        </div>
      </GlassPanel>

      {/* 今日统计 */}
      <GlassPanel padding="md" radius="lg">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium" style={{ color: 'var(--bn-text-primary)' }}>
            今日累计
          </h3>
          <span className="bn-mono text-xs" style={{ color: 'var(--bn-text-tertiary)' }}>
            {(todaySessions ?? []).length} 个 · {todayMinutes} 分钟
          </span>
        </div>
        {(todaySessions ?? []).length === 0 ? (
          <p className="mt-2 text-xs" style={{ color: 'var(--bn-text-tertiary)' }}>
            还没开始今天的第一个番茄
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            {(todaySessions ?? []).slice(0, 5).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 text-xs"
                style={{ color: 'var(--bn-text-secondary)' }}
              >
                <span className="bn-mono w-12 shrink-0"
                  style={{ color: 'var(--bn-text-tertiary)' }}>
                  {new Date(s.started_at).toLocaleTimeString('zh-CN', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
                <span className="flex-1 truncate">
                  {s.note || '(未命名任务)'}
                </span>
                <span className="bn-mono shrink-0"
                  style={{ color: 'var(--bn-text-tertiary)' }}>
                  {Math.round(s.duration_seconds / 60)} 分
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* 配置 */}
      <button
        type="button"
        onClick={() => setShowConfig(!showConfig)}
        className="text-[11px] underline"
        style={{ color: 'var(--bn-text-tertiary)' }}
      >
        {showConfig ? '收起设置' : '设置时长 / 环境音 / 通知'}
      </button>

      {showConfig && (
        <PomodoroConfigPanel config={config} onChange={updateConfig} />
      )}
    </div>
  )
}

function PomodoroConfigPanel({
  config,
  onChange,
}: {
  config: PomodoroConfig
  onChange: (patch: Partial<PomodoroConfig>) => void
}) {
  const [customBvid, setCustomBvid] = useState('')

  return (
    <GlassPanel padding="lg" radius="lg">
      {/* 时长 */}
      <p className="mb-2 text-[11px] uppercase tracking-wider"
        style={{ color: 'var(--bn-text-tertiary)' }}>
        时长(分钟)
      </p>
      <div className="grid grid-cols-3 gap-2">
        <NumField label="专注" value={config.focusMinutes}
          onChange={(v) => onChange({ focusMinutes: v })} />
        <NumField label="短休" value={config.shortBreakMinutes}
          onChange={(v) => onChange({ shortBreakMinutes: v })} />
        <NumField label="长休" value={config.longBreakMinutes}
          onChange={(v) => onChange({ longBreakMinutes: v })} />
      </div>

      {/* 行为 */}
      <p className="mb-2 mt-4 text-[11px] uppercase tracking-wider"
        style={{ color: 'var(--bn-text-tertiary)' }}>
        自动化
      </p>
      <div className="space-y-1.5 text-xs"
        style={{ color: 'var(--bn-text-secondary)' }}>
        <CheckItem
          checked={config.autoStartBreak}
          label="专注结束自动开始休息"
          onChange={(v) => onChange({ autoStartBreak: v })}
        />
        <CheckItem
          checked={config.autoStartNextFocus}
          label="休息结束自动开始下一专注"
          onChange={(v) => onChange({ autoStartNextFocus: v })}
        />
        <CheckItem
          checked={config.enableNotification}
          label="完成时弹浏览器通知"
          onChange={(v) => onChange({ enableNotification: v })}
        />
        <CheckItem
          checked={config.enableChime}
          label="完成时响铃"
          onChange={(v) => onChange({ enableChime: v })}
        />
      </div>

      {/* 环境音 */}
      <p className="mb-2 mt-4 text-[11px] uppercase tracking-wider"
        style={{ color: 'var(--bn-text-tertiary)' }}>
        环境音
      </p>
      <div className="flex flex-wrap gap-1.5">
        {AMBIENT_SOUNDS.map((s) => {
          const active = config.ambientSound === s.key
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onChange({ ambientSound: s.key })}
              className="rounded-full px-2.5 py-1 text-[11px] transition-all"
              style={{
                background: active ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
                border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
              }}
            >
              {s.name}
            </button>
          )
        })}
      </div>
      {config.ambientSound !== 'none' && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px]" style={{ color: 'var(--bn-text-tertiary)' }}>
            音量
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(config.ambientVolume * 100)}
            onChange={(e) => onChange({ ambientVolume: Number(e.target.value) / 100 })}
            className="flex-1"
          />
          <span className="bn-mono w-8 text-right text-[11px]"
            style={{ color: 'var(--bn-text-tertiary)' }}>
            {Math.round(config.ambientVolume * 100)}
          </span>
        </div>
      )}

      {/* B 站背景音(打开新 tab)*/}
      <p className="mb-2 mt-4 text-[11px] uppercase tracking-wider"
        style={{ color: 'var(--bn-text-tertiary)' }}>
        B 站背景音(打开新标签页)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {LEGACY_BILIBILI_BGM.map((b) => (
          <a
            key={b.bvid}
            href={`https://www.bilibili.com/video/${b.bvid}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full px-2.5 py-1 text-[11px] transition-all hover:opacity-80"
            style={{
              background: 'var(--bn-glass)',
              color: 'var(--bn-text-tertiary)',
              border: '0.5px solid var(--bn-glass-border)',
            }}
          >
            🎵 {b.name}
          </a>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          placeholder="自定义 BV 号"
          value={customBvid}
          onChange={(e) => setCustomBvid(e.target.value)}
          className="flex-1"
        />
        {customBvid.trim() && (
          <a
            href={`https://www.bilibili.com/video/${customBvid.trim()}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-3 py-2 text-xs transition-all"
            style={{
              background: 'var(--bn-glass-strong)',
              color: 'var(--bn-text-primary)',
              border: '0.5px solid var(--bn-glass-border)',
            }}
          >
            打开
          </a>
        )}
      </div>
    </GlassPanel>
  )
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <p className="mb-0.5 text-[10px]" style={{ color: 'var(--bn-text-tertiary)' }}>
        {label}
      </p>
      <input
        type="number"
        min={1}
        max={180}
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.min(180, Number(e.target.value) || DEFAULT_CONFIG.focusMinutes)))}
        className="bn-mono w-full rounded-lg px-2 py-1.5 text-sm"
        style={{
          background: 'var(--bn-glass)',
          border: '0.5px solid var(--bn-glass-border)',
          color: 'var(--bn-text-primary)',
        }}
      />
    </div>
  )
}

function CheckItem({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}
