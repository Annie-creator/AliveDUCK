import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Trash2, Check, X, Play, Pause, Square, SkipForward, PictureInPicture2 } from 'lucide-react'
import { db } from '@/db'
import { focusRepo } from '@/repositories'
import { GlassPanel } from '@/components/ui/GlassPanel'
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
  normalizeAmbientKey,
  playChime,
} from '@/lib/ambient-sound'
import { closePip, isPipOpen, isPipSupported, openPip } from '@/lib/pip-window'
import { ensureNotificationPermission } from '@/lib/notifications'
import { resolveTimeRange } from '@/lib/finance-stats'
import type { FocusSession, Habit } from '@/types'

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

  // PiP 更新已经移到 pomodoro-engine 的 notify() 里,
  // 由引擎单例直接推送,不再依赖 React 组件挂载状态。
  // 用户切到别的页面时 PomodoroPanel unmount 不影响 PiP 同步。

  // 状态切换时联动环境音
  // 拆成两个 effect：
  //   1) status 变化时控制 stop / pause / resume
  //   2) 仅在运行中且配置变化时才主动 setSound
  // 这样配置面板里的"点选项立即试听"不会被 effect 强制停掉
  useEffect(() => {
    if (state.status === 'paused') {
      ambientPlayer.pause()
    } else if (state.status === 'idle') {
      ambientPlayer.stop()
    }
  }, [state.status])

  useEffect(() => {
    if (state.status !== 'running') return
    if (config.ambientSound === 'none') {
      ambientPlayer.stop()
    } else {
      ambientPlayer.setSound(config.ambientSound, config.ambientVolume)
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
          <p className="mb-3 text-[11px] uppercase tracking-[0.2em]"
            style={{ color: modeColor, fontWeight: 600 }}>
            {modeLabel} · 第 {state.focusCountInCycle + (state.mode === 'focus' ? 1 : 0)} 个
          </p>

          {/* 大数字 — Phase C: 字重 600, 微大点字号, 运行中带脉冲光晕 */}
          <div
            className={state.status === 'running' ? 'bn-timer-pulse' : ''}
            style={{
              fontFamily: 'var(--bn-font-mono)',
              fontSize: 'clamp(72px, 14vw, 96px)',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.04em',
              color: 'var(--bn-text-primary)',
              lineHeight: 1,
              marginBottom: 18,
              fontFeatureSettings: '"tnum" 1, "ss01" 1',
            }}
          >
            {minutes}:{String(seconds).padStart(2, '0')}
          </div>

          {/* 进度条 — Phase C: 改为 5+5 圆点分组 */}
          <DotProgress progress={progress} color={modeColor} />

          {/* 本次时长快速调整(仅在 focus 模式 + idle 时显示) */}
          {state.mode === 'focus' && state.status === 'idle' && (
            <FocusDurationChips
              configDefault={config.focusMinutes}
              currentOverride={state.focusOverrideMinutes}
            />
          )}

          {/* 控制按钮 — Phase C: 主按钮做成大圆形 icon */}
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleStartOrPause}
              aria-label={state.status === 'running' ? '暂停' : '开始'}
              className="flex h-14 w-14 items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'var(--bn-button-bg)',
                color: 'var(--bn-button-fg)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              }}
            >
              {state.status === 'running' ? (
                <Pause size={22} strokeWidth={2.4} fill="currentColor" />
              ) : (
                <Play size={22} strokeWidth={2.4} fill="currentColor" style={{ marginLeft: 2 }} />
              )}
            </button>
            {state.status !== 'idle' && (
              <button
                type="button"
                onClick={handleStop}
                aria-label="停止"
                className="flex h-11 w-11 items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'var(--bn-glass-strong)',
                  color: 'var(--bn-text-primary)',
                  border: '0.5px solid var(--bn-glass-border)',
                }}
              >
                <Square size={16} strokeWidth={2.4} fill="currentColor" />
              </button>
            )}
            <button
              type="button"
              onClick={handleSkip}
              aria-label="跳过"
              className="flex h-11 w-11 items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'var(--bn-glass)',
                color: 'var(--bn-text-secondary)',
                border: '0.5px solid var(--bn-glass-border)',
              }}
              title="跳过当前阶段"
            >
              <SkipForward size={15} strokeWidth={2} />
            </button>
            {isPipSupported() && (
              <button
                type="button"
                onClick={togglePip}
                aria-label={pipOpen ? '关闭浮窗' : '弹出浮窗'}
                className="flex h-11 w-11 items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95"
                style={{
                  background: pipOpen ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                  color: pipOpen ? 'var(--bn-accent)' : 'var(--bn-text-secondary)',
                  border: `0.5px solid ${pipOpen ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
                }}
                title={pipOpen ? '关闭画中画浮窗' : '弹出画中画浮窗'}
              >
                <PictureInPicture2 size={15} strokeWidth={2} />
              </button>
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
          <div className="mt-2 space-y-0.5">
            {(todaySessions ?? []).slice(0, 5).map((s) => (
              <SessionRow key={s.id} session={s} />
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
        <PomodoroConfigPanel
          config={config}
          onChange={updateConfig}
          isRunning={state.status === 'running'}
        />
      )}
    </div>
  )
}

function PomodoroConfigPanel({
  config,
  onChange,
  isRunning,
}: {
  config: PomodoroConfig
  onChange: (patch: Partial<PomodoroConfig>) => void
  isRunning: boolean
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
        环境音 <span style={{ textTransform: 'none', letterSpacing: 0, marginLeft: 6, opacity: 0.7 }}>· 点选项即可试听</span>
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {AMBIENT_SOUNDS.map((s) => {
          const active = normalizeAmbientKey(config.ambientSound) === s.key
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                onChange({ ambientSound: s.key })
                // 点了立即试听 3 秒(番茄钟未启动时也能听到反馈)
                if (!isRunning) {
                  if (s.key === 'none') {
                    ambientPlayer.stop()
                  } else {
                    ambientPlayer.preview(s.key, config.ambientVolume, 3000)
                  }
                }
              }}
              className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-left transition-all"
              style={{
                background: active ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-secondary)',
                border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden>{s.emoji}</span>
              <div className="min-w-0 flex-1">
                <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: '-0.005em' }}>{s.name}</div>
                <div
                  className="truncate"
                  style={{
                    fontSize: 10,
                    color: 'var(--bn-text-tertiary)',
                    marginTop: 1,
                    letterSpacing: '-0.005em',
                  }}
                >
                  {s.hint}
                </div>
              </div>
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

/**
 * 圆点进度条 — Phase C 设计:5+5 圆点分组,中间略宽间距,
 * 比线条更有"番茄分段"语义。
 *
 * 实现：10 个圆点,progress * 10 决定亮起的个数;
 * 当前正在进行的那一颗用半透明亮色,做出"正在填充"的感觉。
 */
function DotProgress({ progress, color }: { progress: number; color: string }) {
  const total = 10
  const filledFloat = Math.max(0, Math.min(total, progress * total))
  const filledFull = Math.floor(filledFloat)
  const partialFraction = filledFloat - filledFull // 当前那一颗的填充比例

  return (
    <div className="mb-5 flex items-center justify-center" style={{ gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => {
        const isFull = i < filledFull
        const isCurrent = i === filledFull && partialFraction > 0
        // 5+5 分组:第 5 个之后多 6px 间距
        const extraMarginLeft = i === 5 ? 8 : 0

        return (
          <span
            key={i}
            style={{
              marginLeft: extraMarginLeft,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isFull
                ? color
                : isCurrent
                  ? `color-mix(in srgb, ${color} ${30 + partialFraction * 60}%, transparent)`
                  : 'var(--bn-glass)',
              border: isFull || isCurrent ? 'none' : '0.5px solid var(--bn-glass-border)',
              transition: 'background 0.4s ease',
              flexShrink: 0,
            }}
          />
        )
      })}
    </div>
  )
}

/**
 * 单条 focus session 行。支持就地编辑任务名 + 软删除。
 *
 * 视觉契约：
 *   时间(12px mono) | 任务名(13px,可编辑) | 时长(12px mono) | 操作(hover 出现)
 */
function SessionRow({ session }: { session: FocusSession }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.note || '')
  const [removing, setRemoving] = useState(false)

  async function save() {
    const next = draft.trim()
    if (next !== (session.note || '')) {
      try {
        await focusRepo.update(session.id, { note: next })
      } catch {
        // ignore — useLiveQuery 会重新拉数据,失败时回滚到原值
      }
    }
    setEditing(false)
  }

  function cancel() {
    setDraft(session.note || '')
    setEditing(false)
  }

  async function handleDelete() {
    setRemoving(true)
    setTimeout(() => {
      void focusRepo.softDelete(session.id)
    }, 180)
  }

  return (
    <div
      className="group flex items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-all"
      style={{
        color: 'var(--bn-text-secondary)',
        opacity: removing ? 0 : 1,
        transform: removing ? 'translateX(-12px)' : 'translateX(0)',
      }}
    >
      <span
        className="bn-mono w-12 shrink-0"
        style={{ color: 'var(--bn-text-tertiary)', fontSize: 11 }}
      >
        {new Date(session.started_at).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') cancel()
          }}
          onBlur={() => void save()}
          className="flex-1 rounded-md px-1.5 py-0.5"
          style={{
            background: 'var(--bn-glass-strong)',
            color: 'var(--bn-text-primary)',
            border: '0.5px solid var(--bn-accent)',
            fontSize: 12,
            outline: 'none',
            letterSpacing: '-0.005em',
          }}
        />
      ) : (
        <span
          className="flex-1 cursor-text truncate"
          onClick={() => setEditing(true)}
          title="点击重命名"
          style={{
            color: session.note ? 'var(--bn-text-secondary)' : 'var(--bn-text-tertiary)',
            fontStyle: session.note ? 'normal' : 'italic',
          }}
        >
          {session.note || '(未命名任务)'}
        </span>
      )}

      <span
        className="bn-mono shrink-0"
        style={{ color: 'var(--bn-text-tertiary)', fontSize: 11 }}
      >
        {Math.round(session.duration_seconds / 60)} 分
      </span>

      {/* 操作按钮 — 桌面端 hover 出现, 移动端常显 */}
      {!editing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="重命名"
            className="rounded p-1 hover:bg-white/10"
            style={{ color: 'var(--bn-text-tertiary)' }}
          >
            <Pencil size={11} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            aria-label="删除"
            className="rounded p-1 hover:bg-white/10"
            style={{ color: 'var(--bn-text-tertiary)' }}
          >
            <Trash2 size={11} strokeWidth={1.8} />
          </button>
        </div>
      )}
      {editing && (
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onMouseDown={(e) => {
              // mouseDown 而不是 onClick:避免 input onBlur 先于 click 触发导致丢交互
              e.preventDefault()
              void save()
            }}
            aria-label="保存"
            className="rounded p-1 hover:bg-white/10"
            style={{ color: 'var(--bn-positive)' }}
          >
            <Check size={11} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              cancel()
            }}
            aria-label="取消"
            className="rounded p-1 hover:bg-white/10"
            style={{ color: 'var(--bn-text-tertiary)' }}
          >
            <X size={11} strokeWidth={2.4} />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * 本次专注时长快速选择器。
 *
 * 出现在主面板大数字下方,仅在 idle + focus 模式显示。
 * 设计契约：
 *   - 不修改全局配置 config.focusMinutes
 *   - 只调用 pomodoroEngine.setFocusOverride(minutes | null)
 *   - "默认"档位高亮（来自 configDefault）
 *   - 当前 override 与"默认"不同时,显示对应档位激活态
 *   - "自定义" → prompt 输入数字（简洁优先;如需更精致后续可换成 popover）
 */
function FocusDurationChips({
  configDefault,
  currentOverride,
}: {
  configDefault: number
  currentOverride: number | null
}) {
  // 候选档位:确保包含用户的默认值
  const baseOptions = [10, 15, 25, 45, 60, 90]
  const options = baseOptions.includes(configDefault)
    ? baseOptions
    : [...baseOptions, configDefault].sort((a, b) => a - b)
  const effective = currentOverride ?? configDefault

  function handlePick(minutes: number) {
    if (minutes === configDefault) {
      // 选了默认值 → 清掉 override
      pomodoroEngine.setFocusOverride(null)
    } else {
      pomodoroEngine.setFocusOverride(minutes)
    }
  }

  function handleCustom() {
    // eslint-disable-next-line no-alert
    const raw = window.prompt('本次专注多少分钟?(1-240)', String(effective))
    if (!raw) return
    const n = Math.floor(Number(raw))
    if (!Number.isFinite(n) || n < 1 || n > 240) return
    if (n === configDefault) {
      pomodoroEngine.setFocusOverride(null)
    } else {
      pomodoroEngine.setFocusOverride(n)
    }
  }

  return (
    <div className="mb-4">
      <p
        className="mb-1.5 uppercase"
        style={{
          fontSize: 'var(--bn-text-xs)',
          color: 'var(--bn-text-tertiary)',
          letterSpacing: '0.08em',
          fontWeight: 500,
        }}
      >
        本次时长 <span
          style={{
            textTransform: 'none',
            letterSpacing: 0,
            marginLeft: 6,
            opacity: 0.7,
          }}
        >
          · 仅本次有效,启动后自动回到默认 {configDefault} 分钟
        </span>
      </p>

      {/* ± stepper（每按一次 ±5 分钟,1-240 范围）*/}
      <div className="mb-2 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            const next = Math.max(1, effective - 5)
            if (next === configDefault) {
              pomodoroEngine.setFocusOverride(null)
            } else {
              pomodoroEngine.setFocusOverride(next)
            }
          }}
          aria-label="减 5 分钟"
          disabled={effective <= 1}
          className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
          style={{
            background: 'var(--bn-glass-strong)',
            border: '0.5px solid var(--bn-glass-border)',
            color: 'var(--bn-text-primary)',
            fontWeight: 700,
          }}
        >
          −
        </button>
        <span
          className="bn-mono"
          style={{
            fontSize: 18,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--bn-text-primary)',
            letterSpacing: '-0.02em',
            minWidth: 80,
            textAlign: 'center',
          }}
        >
          {effective}{' '}
          <span
            style={{
              fontSize: 12,
              color: 'var(--bn-text-tertiary)',
              fontWeight: 400,
              letterSpacing: 0,
            }}
          >
            分钟
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            const next = Math.min(240, effective + 5)
            if (next === configDefault) {
              pomodoroEngine.setFocusOverride(null)
            } else {
              pomodoroEngine.setFocusOverride(next)
            }
          }}
          aria-label="加 5 分钟"
          disabled={effective >= 240}
          className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
          style={{
            background: 'var(--bn-accent)',
            color: 'var(--bn-button-fg)',
            border: 'none',
            fontWeight: 700,
          }}
        >
          +
        </button>
        {currentOverride !== null && (
          <button
            type="button"
            onClick={() => pomodoroEngine.setFocusOverride(null)}
            className="ml-1 rounded-full px-2 py-1 transition-colors hover:bg-white/5"
            style={{
              fontSize: 'var(--bn-text-xs)',
              color: 'var(--bn-text-tertiary)',
            }}
            title="恢复默认 25 分钟"
          >
            ↺ 默认
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {options.map((m) => {
          const active = effective === m
          const isDefault = m === configDefault
          return (
            <button
              key={m}
              type="button"
              onClick={() => handlePick(m)}
              className="bn-mono rounded-full px-3 py-1 transition-all"
              style={{
                fontSize: 'var(--bn-text-sm)',
                background: active ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-secondary)',
                border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
                fontWeight: 600,
              }}
              title={isDefault ? '默认' : `临时覆盖为 ${m} 分钟`}
            >
              {m}
              {isDefault && (
                <span
                  style={{
                    fontSize: 9,
                    marginLeft: 2,
                    opacity: 0.6,
                    fontWeight: 400,
                  }}
                >
                  默
                </span>
              )}
            </button>
          )
        })}
        <button
          type="button"
          onClick={handleCustom}
          className="rounded-full px-3 py-1 transition-all"
          style={{
            fontSize: 'var(--bn-text-sm)',
            background: 'var(--bn-glass)',
            color: 'var(--bn-text-tertiary)',
            border: '0.5px dashed var(--bn-glass-border)',
          }}
        >
          自定义…
        </button>
      </div>
    </div>
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
