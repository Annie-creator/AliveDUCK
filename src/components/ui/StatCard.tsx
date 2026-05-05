import { GlassPanel } from './GlassPanel'

interface Props {
  label: string
  value: string
  /** 数字色调:正数(收入)绿色,中性(支出)主色,负向警示 */
  tone?: 'neutral' | 'positive' | 'negative'
}

export function StatCard({ label, value, tone = 'neutral' }: Props) {
  const color =
    tone === 'positive'
      ? 'var(--bn-positive)'
      : tone === 'negative'
        ? 'var(--bn-negative)'
        : 'var(--bn-text-primary)'

  return (
    <GlassPanel padding="md" radius="lg">
      <p
        className="mb-1 text-[11px] font-medium tracking-wider"
        style={{ color: 'var(--bn-text-secondary)' }}
      >
        {label}
      </p>
      <p className="bn-mono text-[22px] font-medium" style={{ color }}>
        {value}
      </p>
    </GlassPanel>
  )
}
