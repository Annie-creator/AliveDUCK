import { PomodoroPanel } from '@/components/timer/PomodoroPanel'

export function TimerPage() {
  return (
    <div className="space-y-5">
      <div>
        <p
          className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: 'var(--bn-text-secondary)' }}
        >
          POMODORO
        </p>
        <h1
          className="text-[30px] leading-[1.15]"
          style={{
            color: 'var(--bn-text-primary)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
          }}
        >
          番茄钟
          <span
            className="ml-2"
            style={{
              color: 'var(--bn-text-tertiary)',
              fontWeight: 300,
              letterSpacing: '-0.02em',
            }}
          >
            一颗一颗,慢慢推
          </span>
        </h1>
      </div>

      <PomodoroPanel />
    </div>
  )
}
