import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileSpreadsheet } from 'lucide-react'
import { db } from '@/db'
import { financeRepo } from '@/repositories'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { ListRow } from '@/components/ui/ListRow'
import { QuickEntryForm } from '@/components/finance/QuickEntryForm'
import { BudgetProgress } from '@/components/finance/BudgetProgress'
import { TransactionEditor } from '@/components/finance/TransactionEditor'
import { XlsxImporterModal } from '@/components/finance/XlsxImporterModal'
import { ensureDefaults } from '@/lib/seed-defaults'
import { formatMoney } from '@/lib/currency'
import { useExpenseHighlight } from '@/lib/preferences'
import type { FinanceTransaction } from '@/types'

export function FinancePage() {
  const [editing, setEditing] = useState<FinanceTransaction | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [expenseHighlight] = useExpenseHighlight()

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
    await financeRepo.softDelete(id)
  }

  return (
    <div className="space-y-5">
      {/* 页面标题 */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p
            className="mb-1.5 uppercase"
            style={{
              fontSize: 'var(--bn-text-xs)',
              fontWeight: 500,
              color: 'var(--bn-text-secondary)',
              letterSpacing: '0.08em',
            }}
          >
            FINANCE
          </p>
          <h1
            className="leading-[1.15]"
            style={{
              fontSize: 'var(--bn-text-3xl)',
              color: 'var(--bn-text-primary)',
              fontWeight: 600,
              letterSpacing: '-0.03em',
            }}
          >
            记账
            <span
              className="ml-2"
              style={{
                color: 'var(--bn-text-tertiary)',
                fontWeight: 400,
                fontSize: 'var(--bn-text-lg)',
                letterSpacing: '-0.015em',
              }}
            >
              日常出入一览
            </span>
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowImport(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 transition-all hover:opacity-85"
          style={{
            background: 'var(--bn-glass)',
            color: 'var(--bn-text-secondary)',
            border: '0.5px solid var(--bn-glass-border)',
            fontSize: 'var(--bn-text-sm)',
          }}
        >
          <FileSpreadsheet size={14} strokeWidth={1.8} />
          <span>导入 Excel</span>
        </button>
      </div>

      <BudgetProgress />

      <QuickEntryForm />

      {/* 交易列表 */}
      <GlassPanel padding="none" radius="lg" variant="strong">
        <div
          className="flex items-baseline justify-between px-5 py-4"
          style={{ borderBottom: '0.5px solid var(--bn-row-border)' }}
        >
          <h2
            style={{
              fontSize: 'var(--bn-text-md)',
              fontWeight: 600,
              color: 'var(--bn-text-primary)',
              letterSpacing: '-0.015em',
            }}
          >
            最近交易
          </h2>
          <span style={{ fontSize: 'var(--bn-text-xs)', color: 'var(--bn-text-tertiary)' }}>
            {txs?.length ?? 0} 笔 · 点行编辑 · 左滑删除
          </span>
        </div>

        {!txs || txs.length === 0 ? (
          <p
            className="py-12 text-center"
            style={{ color: 'var(--bn-text-tertiary)', fontSize: 'var(--bn-text-sm)' }}
          >
            还没有记录,试着加一笔。
          </p>
        ) : (
          <div className="px-2 py-1">
            {txs.map((t, idx) => {
              const cat = t.category_id ? catMap.get(t.category_id) : null
              const dotColor = cat?.color ?? 'var(--bn-text-tertiary)'
              const isIncome = t.type === 'income'

              // note 智能拆分：Excel 导入数据通常是 "商品 · 在 地点" 这种格式
              // 第一段当主标题(明细),后续段当 extras 拼到副标题里
              const noteParts = (t.note || '')
                .split(/\s*·\s*/)
                .map((s) => s.trim())
                .filter(Boolean)
              const detail = noteParts[0] || ''
              const extras = noteParts.slice(1)

              // 主标题：明细 > 商家 > 占位
              const primaryText = detail || t.participant?.trim() || '(未填)'

              // 副标题：商家 · 类别 · 地点(extras) · 日期
              const subParts: string[] = []
              if (t.participant?.trim() && detail) subParts.push(t.participant)
              if (cat?.name) subParts.push(cat.name)
              subParts.push(...extras)
              subParts.push(formatRelativeDate(t.occurred_at))

              return (
                <ListRow
                  key={t.id}
                  isLast={idx === txs.length - 1}
                  leadingWidth={36}
                  leading={
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full"
                      style={{
                        background: cat ? `${dotColor}1F` : 'var(--bn-glass)',
                        border: `0.5px solid ${cat ? `${dotColor}55` : 'var(--bn-glass-border)'}`,
                        fontSize: 'var(--bn-text-md)',
                      }}
                    >
                      {cat?.icon ?? '·'}
                    </span>
                  }
                  title={primaryText}
                  subtitle={subParts.join(' · ')}
                  trailing={
                    <span
                      className="bn-mono"
                      style={{
                        fontSize: 'var(--bn-text-lg)',
                        color: isIncome
                          ? 'var(--bn-positive)'
                          : expenseHighlight
                            ? 'var(--bn-negative)'
                            : 'var(--bn-text-primary)',
                        fontWeight: 600,
                      }}
                    >
                      {isIncome ? '+' : '−'}
                      {formatMoney(t.amount, t.currency)}
                    </span>
                  }
                  onClick={() => setEditing(t)}
                  onDelete={() => void deleteRow(t.id)}
                />
              )
            })}
          </div>
        )}
      </GlassPanel>

      {editing && (
        <TransactionEditor transaction={editing} onClose={() => setEditing(null)} />
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
