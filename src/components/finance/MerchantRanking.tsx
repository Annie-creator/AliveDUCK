import type { GroupRow } from '@/lib/finance-stats'

export function MerchantRanking({
  data,
  topN = 10,
}: {
  data: GroupRow[]
  topN?: number
}) {
  const top = data.slice(0, topN)
  if (top.length === 0) {
    return (
      <div className="py-8 text-center text-xs"
        style={{ color: 'var(--bn-text-tertiary)' }}>
        没有商家记录
      </div>
    )
  }
  const max = top[0]!.expense

  return (
    <div className="space-y-1.5">
      {top.map((g, i) => (
        <div key={g.key} className="flex items-center gap-2.5 py-1">
          <span
            className="bn-mono w-5 shrink-0 text-right text-[11px]"
            style={{ color: 'var(--bn-text-tertiary)' }}
          >
            {i + 1}
          </span>
          <span
            className="w-28 shrink-0 truncate text-xs"
            style={{ color: 'var(--bn-text-primary)' }}
            title={g.label}
          >
            {g.label}
          </span>
          <div
            className="relative h-5 flex-1 overflow-hidden rounded"
            style={{ background: 'var(--bn-glass)' }}
          >
            <div
              className="h-full rounded transition-all"
              style={{
                width: `${(g.expense / max) * 100}%`,
                background: `linear-gradient(90deg, var(--bn-cat-${(i % 4) + 1}) 0%, var(--bn-cat-${((i + 2) % 4) + 1}) 100%)`,
                opacity: 0.85,
              }}
            />
          </div>
          <span
            className="bn-mono w-16 shrink-0 text-right text-xs"
            style={{ color: 'var(--bn-text-primary)' }}
          >
            € {g.expense.toFixed(2)}
          </span>
          <span
            className="bn-mono w-8 shrink-0 text-right text-[10px]"
            style={{ color: 'var(--bn-text-tertiary)' }}
          >
            {g.count}笔
          </span>
        </div>
      ))}
    </div>
  )
}
