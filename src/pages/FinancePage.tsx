import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { QuickEntryForm } from '@/components/finance/QuickEntryForm'
import { BudgetProgress } from '@/components/finance/BudgetProgress'
import { ensureDefaults } from '@/lib/seed-defaults'
import { formatMoney } from '@/lib/currency'

export function FinancePage() {
  // 启动时确保默认分类已 seed(幂等,有就跳过)
  useEffect(() => {
    void ensureDefaults()
  }, [])

  const txs = useLiveQuery(
    () =>
      db.finance_transactions
        .filter((t) => !t.deleted_at)
        .reverse()
        .sortBy('occurred_at')
        .then((arr) => arr.slice(0, 50)),
    [],
    [],
  )

  const categories = useLiveQuery(
    () => db.categories.filter((c) => !c.deleted_at).toArray(),
    [],
    [],
  )

  const catMap = new Map((categories ?? []).map((c) => [c.id, c]))

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: 'var(--bn-text-secondary)' }}>
          FINANCE
        </p>
        <h1 className="text-[30px] leading-[1.15]"
          style={{
            color: 'var(--bn-text-primary)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
          }}>
          记账
          <span className="ml-2"
            style={{
              color: 'var(--bn-text-tertiary)',
              fontWeight: 300,
              letterSpacing: '-0.02em',
            }}>
            日常出入一览
          </span>
        </h1>
      </div>

      <BudgetProgress />

      <QuickEntryForm />

      <GlassPanel padding="lg" radius="lg" variant="strong">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
            最近交易
          </h2>
          <span className="text-[11px]" style={{ color: 'var(--bn-text-tertiary)' }}>
            最近 {txs?.length ?? 0} 笔
          </span>
        </div>

        {!txs || txs.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: 'var(--bn-text-tertiary)' }}>
            还没有记录,试着加一笔。
          </p>
        ) : (
          <div>
            {txs.map((t) => {
              const cat = t.category_id ? catMap.get(t.category_id) : null
              const dotColor = cat?.color ?? 'var(--bn-text-tertiary)'
              const isIncome = t.type === 'income'
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3.5 py-2.5"
                  style={{ borderBottom: '0.5px solid var(--bn-row-border)' }}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs"
                    style={{
                      background: cat ? `${dotColor}22` : 'var(--bn-glass)',
                      border: `0.5px solid ${dotColor}55`,
                    }}
                  >
                    {cat?.icon ?? '·'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[13.5px] font-medium"
                      style={{ color: 'var(--bn-text-primary)' }}
                    >
                      {t.participant || '(未命名)'}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[11.5px]"
                      style={{ color: 'var(--bn-text-tertiary)' }}
                    >
                      {cat?.name ?? '未分类'}
                      {t.note ? ` · ${t.note}` : ''}
                      {' · '}
                      {formatRelativeDate(t.occurred_at)}
                    </p>
                  </div>
                  <span
                    className="bn-mono text-[13.5px]"
                    style={{
                      color: isIncome ? 'var(--bn-positive)' : 'var(--bn-text-primary)',
                    }}
                  >
                    {isIncome ? '+' : '−'}
                    {formatMoney(t.amount, t.currency)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </GlassPanel>
    </div>
  )
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
