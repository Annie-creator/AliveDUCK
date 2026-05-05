import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { financeRepo } from '@/repositories'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { QuickEntryForm } from '@/components/finance/QuickEntryForm'
import { BudgetProgress } from '@/components/finance/BudgetProgress'
import { TransactionEditor } from '@/components/finance/TransactionEditor'
import { XlsxImporterModal } from '@/components/finance/XlsxImporterModal'
import { ensureDefaults } from '@/lib/seed-defaults'
import { formatMoney } from '@/lib/currency'
import type { FinanceTransaction } from '@/types'

export function FinancePage() {
  const [editing, setEditing] = useState<FinanceTransaction | null>(null)
  const [showImport, setShowImport] = useState(false)

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

  async function deleteRow(id: string) {
    if (!confirm('确认删除这笔交易?')) return
    await financeRepo.softDelete(id)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
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
        <button
          type="button"
          onClick={() => setShowImport(true)}
          className="rounded-xl px-3 py-2 text-xs transition-all hover:opacity-85"
          style={{
            background: 'var(--bn-glass)',
            color: 'var(--bn-text-secondary)',
            border: '0.5px solid var(--bn-glass-border)',
          }}
        >
          📊 导入 Excel
        </button>
      </div>

      <BudgetProgress />

      <QuickEntryForm />

      <GlassPanel padding="lg" radius="lg" variant="strong">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
            最近交易
          </h2>
          <span className="text-[11px]" style={{ color: 'var(--bn-text-tertiary)' }}>
            最近 {txs?.length ?? 0} 笔 · 点行编辑 · 划过显示删除
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

              // ─── 主标题 = 商家(participant) ────
              // ─── 副标题 = 详细信息 + 分类 + 日期 ─
              // 这是新逻辑:商家是主体,details(原 note)是补充
              const primaryText = t.participant?.trim() || t.note?.trim() || '(未填)'
              const subParts: string[] = []
              if (t.participant && t.note?.trim()) subParts.push(t.note)
              if (cat?.name) subParts.push(cat.name)
              subParts.push(formatRelativeDate(t.occurred_at))

              return (
                <div
                  key={t.id}
                  className="group relative flex items-center gap-3.5 py-2.5"
                  style={{ borderBottom: '0.5px solid var(--bn-row-border)' }}
                >
                  {/* 左侧 icon */}
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                    style={{
                      background: cat ? `${dotColor}22` : 'var(--bn-glass)',
                      border: `0.5px solid ${dotColor}55`,
                    }}
                  >
                    {cat?.icon ?? '·'}
                  </span>

                  {/* 中间标题 + 副标题(可点编辑)*/}
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    className="min-w-0 flex-1 text-left transition-colors hover:opacity-90"
                  >
                    <p
                      className="truncate text-[14px] font-medium"
                      style={{ color: 'var(--bn-text-primary)' }}
                    >
                      {primaryText}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[12px]"
                      style={{ color: 'var(--bn-text-tertiary)' }}
                    >
                      {subParts.join(' · ')}
                    </p>
                  </button>

                  {/* 金额 */}
                  <span
                    className="bn-mono text-[14px] tabular-nums shrink-0"
                    style={{
                      color: isIncome ? 'var(--bn-positive)' : 'var(--bn-text-primary)',
                    }}
                  >
                    {isIncome ? '+' : '−'}
                    {formatMoney(t.amount, t.currency)}
                  </span>

                  {/* 行内删除按钮(hover/touch 显示)*/}
                  <button
                    type="button"
                    onClick={() => deleteRow(t.id)}
                    className="rounded-full px-1.5 py-1 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: 'var(--bn-negative)' }}
                    aria-label="删除"
                  >
                    🗑
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </GlassPanel>

      {editing && (
        <TransactionEditor
          transaction={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {showImport && <XlsxImporterModal onClose={() => setShowImport(false)} />}
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
