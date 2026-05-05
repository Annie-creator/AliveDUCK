import type { TimeRangePreset } from '@/lib/finance-stats'

const PRESETS: Array<{ key: TimeRangePreset; label: string }> = [
  { key: 'this_week', label: '本周' },
  { key: 'this_month', label: '本月' },
  { key: 'last_month', label: '上月' },
  { key: 'this_quarter', label: '本季' },
  { key: 'this_year', label: '今年' },
  { key: 'last_30_days', label: '近 30 天' },
  { key: 'last_90_days', label: '近 90 天' },
  { key: 'all', label: '全部' },
]

export function TimeFilter({
  value,
  onChange,
}: {
  value: TimeRangePreset
  onChange: (v: TimeRangePreset) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESETS.map((p) => {
        const active = value === p.key
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key)}
            className="rounded-full px-3 py-1 text-[11.5px] transition-all"
            style={{
              background: active ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
              color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
              border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
              fontWeight: active ? 500 : 400,
              boxShadow: active ? 'inset 0 0 0 0.5px var(--bn-accent)' : 'none',
            }}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
