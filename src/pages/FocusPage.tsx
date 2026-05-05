import { useState } from 'react'
import { TimerPage } from '@/pages/TimerPage'
import { HabitsPage } from '@/pages/HabitsPage'

type Tab = 'timer' | 'habits'

export function FocusPage() {
  const [tab, setTab] = useState<Tab>('timer')

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-full p-0.5"
        style={{
          background: 'var(--bn-glass)',
          border: '0.5px solid var(--bn-glass-border)',
          width: 'fit-content',
        }}>
        {([
          { key: 'timer' as const, label: '🍅 番茄钟' },
          { key: 'habits' as const, label: '☑️ 习惯' },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="rounded-full px-3 py-1 text-[12px] transition-all"
            style={{
              background: tab === t.key ? 'var(--bn-glass-strong)' : 'transparent',
              color: tab === t.key ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
              fontWeight: tab === t.key ? 500 : 400,
              boxShadow: tab === t.key ? 'inset 0 0 0 0.5px var(--bn-accent)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'timer' ? <TimerPage /> : <HabitsPage />}
    </div>
  )
}
