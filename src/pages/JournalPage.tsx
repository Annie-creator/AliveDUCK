import { JournalPanel } from '@/components/journal/JournalPanel'

export function JournalPage() {
  return (
    <div className="space-y-5">
      <div>
        <p
          className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: 'var(--bn-text-secondary)' }}
        >
          JOURNAL
        </p>
        <h1
          className="text-[30px] leading-[1.15]"
          style={{
            color: 'var(--bn-text-primary)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
          }}
        >
          日记
          <span
            className="ml-2"
            style={{
              color: 'var(--bn-text-tertiary)',
              fontWeight: 300,
              letterSpacing: '-0.02em',
            }}
          >
            写给以后会忘的自己
          </span>
        </h1>
      </div>

      <JournalPanel />
    </div>
  )
}
