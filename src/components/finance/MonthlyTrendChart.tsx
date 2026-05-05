import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { GroupRow } from '@/lib/finance-stats'

export function MonthlyTrendChart({ data }: { data: GroupRow[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-xs"
        style={{ color: 'var(--bn-text-tertiary)' }}>
        没有数据
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="2 2" stroke="var(--bn-row-border)" />
        <XAxis
          dataKey="key"
          tick={{ fontSize: 10, fill: 'var(--bn-text-tertiary)' }}
          stroke="var(--bn-row-border)"
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--bn-text-tertiary)' }}
          stroke="var(--bn-row-border)"
          width={45}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--bn-bg)',
            border: '0.5px solid var(--bn-glass-border)',
            borderRadius: '8px',
            fontSize: '11px',
          }}
          formatter={(v: unknown) => `€ ${Number(v).toFixed(2)}`}
        />
        <Line
          type="monotone"
          dataKey="expense"
          stroke="var(--bn-cat-1)"
          strokeWidth={2}
          dot={{ r: 3 }}
          name="支出"
        />
        <Line
          type="monotone"
          dataKey="income"
          stroke="var(--bn-positive)"
          strokeWidth={2}
          dot={{ r: 3 }}
          name="收入"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
