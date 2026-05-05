import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import type { Category } from '@/types'
import type { GroupRow } from '@/lib/finance-stats'

export function CategoryDonutChart({
  data,
  categories,
}: {
  data: GroupRow[]
  categories: Category[]
}) {
  // 只显示支出 > 0 的分类
  const filtered = data.filter((g) => g.expense > 0)
  if (filtered.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-xs"
        style={{ color: 'var(--bn-text-tertiary)' }}>
        没有支出数据
      </div>
    )
  }

  const catColorMap = new Map(categories.map((c) => [c.id, c.color]))
  const total = filtered.reduce((s, g) => s + g.expense, 0)

  const chartData = filtered.map((g) => ({
    name: g.label,
    value: Math.round(g.expense * 100) / 100,
    color: catColorMap.get(g.key) ?? '#888780',
  }))

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <div className="relative" style={{ width: 180, height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              stroke="none"
            >
              {chartData.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'var(--bn-bg)',
                border: '0.5px solid var(--bn-glass-border)',
                borderRadius: '8px',
                fontSize: '11px',
              }}
              formatter={(v: unknown) => `€ ${Number(v).toFixed(2)}`}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--bn-text-tertiary)' }}>
            总支出
          </p>
          <p className="bn-mono text-base font-medium"
            style={{ color: 'var(--bn-text-primary)' }}>
            € {total.toFixed(0)}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        {chartData.slice(0, 8).map((d) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ background: d.color }}
            />
            <span className="flex-1 truncate" style={{ color: 'var(--bn-text-primary)' }}>
              {d.name}
            </span>
            <span className="bn-mono shrink-0" style={{ color: 'var(--bn-text-secondary)' }}>
              € {d.value.toFixed(2)}
            </span>
            <span className="bn-mono w-10 shrink-0 text-right text-[10px]"
              style={{ color: 'var(--bn-text-tertiary)' }}>
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
