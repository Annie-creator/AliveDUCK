import { useMemo, useState } from 'react'
import { financeRepo } from '@/repositories'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { ListRow } from '@/components/ui/ListRow'
import { TransactionEditor } from '@/components/finance/TransactionEditor'
import { formatMoney } from '@/lib/currency'
import { useExpenseHighlight } from '@/lib/preferences'
import type { Category, FinanceTransaction } from '@/types'

interface Props {
  /** 已经按时间筛过的交易（来自分析页） */
  transactions: FinanceTransaction[]
  /** 用于显示分类名/图标/颜色 */
  categories: Category[]
  /** 列表标题（默认"交易明细"）*/
  title?: string
}

type TypeFilter = 'all' | 'expense' | 'income'
type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

const PAGE_SIZE = 50

/**
 * 分析页用的交易明细列表。
 *
 * 设计点：
 * - 筛选在【时间筛选已经收紧】的基础上再加一层（类型 / 分类 / 文本搜索）
 * - 排序：4 种常用维度
 * - 分页：默认显示 50 条，点"加载更多"再 +50（避免一次渲染几千行）
 * - 点击行 → 弹 TransactionEditor（复用 FinancePage 的体验）
 * - 软删除（左滑）也支持，跟 FinancePage 一致
 */
export function TransactionList({ transactions, categories, title = '交易明细' }: Props) {
  const [editing, setEditing] = useState<FinanceTransaction | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  /** 选中的分类 id 集合；空集 = 全部分类。'_uncat' 代表未分类 */
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('date_desc')
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [expenseHighlight] = useExpenseHighlight()

  const catMap = useMemo(() => {
    const m = new Map<string, Category>()
    for (const c of categories) m.set(c.id, c)
    return m
  }, [categories])

  /**
   * 数据源里出现过的分类（按出现频次降序）—— 把它们做成快捷 chip
   * 不出现的分类不显示，避免长长一排没人用的标签
   */
  const catsInData = useMemo(() => {
    const counts = new Map<string, number>() // id -> count
    let uncategorized = 0
    for (const t of transactions) {
      if (t.category_id) {
        counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1)
      } else {
        uncategorized++
      }
    }
    const entries: Array<{ id: string; name: string; icon: string; color: string; count: number }> = []
    for (const [id, count] of counts.entries()) {
      const cat = catMap.get(id)
      if (cat) {
        entries.push({ id, name: cat.name, icon: cat.icon, color: cat.color, count })
      }
    }
    entries.sort((a, b) => b.count - a.count)
    if (uncategorized > 0) {
      entries.push({
        id: '_uncat',
        name: '未分类',
        icon: '·',
        color: 'var(--bn-text-tertiary)',
        count: uncategorized,
      })
    }
    return entries
  }, [transactions, catMap])

  /** 应用筛选 + 搜索 + 排序 */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let arr = transactions.filter((t) => {
      // 类型
      if (typeFilter === 'expense' && t.type !== 'expense') return false
      if (typeFilter === 'income' && t.type !== 'income') return false
      // 分类
      if (selectedCats.size > 0) {
        if (t.category_id) {
          if (!selectedCats.has(t.category_id)) return false
        } else {
          if (!selectedCats.has('_uncat')) return false
        }
      }
      // 搜索：商家 + 备注
      if (q) {
        const hay = `${t.participant} ${t.note}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    // 排序
    arr = [...arr]
    switch (sort) {
      case 'date_desc':
        arr.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
        break
      case 'date_asc':
        arr.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
        break
      case 'amount_desc':
        arr.sort((a, b) => b.amount - a.amount)
        break
      case 'amount_asc':
        arr.sort((a, b) => a.amount - b.amount)
        break
    }
    return arr
  }, [transactions, typeFilter, selectedCats, search, sort])

  /** 当前筛选下的合计（不分页） */
  const summary = useMemo(() => {
    let income = 0
    let expense = 0
    for (const t of filtered) {
      // 这里直接用记账币种合计 —— 对"明细查看"的诉求来说更直观
      // （分析页顶部的总览卡片才用 base 折算）
      if (t.type === 'income') income += t.amount
      else if (t.type === 'expense') expense += t.amount
    }
    return { income, expense, count: filtered.length }
  }, [filtered])

  const visible = filtered.slice(0, pageSize)
  const hasMore = filtered.length > pageSize

  function toggleCat(id: string) {
    setSelectedCats((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setPageSize(PAGE_SIZE) // 改了筛选 → 回到首屏
  }

  function clearAllFilters() {
    setTypeFilter('all')
    setSelectedCats(new Set())
    setSearch('')
    setPageSize(PAGE_SIZE)
  }

  const hasActiveFilter =
    typeFilter !== 'all' || selectedCats.size > 0 || search.trim() !== ''

  async function deleteRow(id: string) {
    await financeRepo.softDelete(id)
  }

  return (
    <GlassPanel padding="none" radius="lg" variant="strong">
      {/* 标题区 */}
      <div
        className="px-5 py-4"
        style={{ borderBottom: '0.5px solid var(--bn-row-border)' }}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2
            style={{
              fontSize: 'var(--bn-text-md)',
              fontWeight: 600,
              color: 'var(--bn-text-primary)',
              letterSpacing: '-0.015em',
            }}
          >
            {title}
          </h2>
          <span style={{ fontSize: 'var(--bn-text-xs)', color: 'var(--bn-text-tertiary)' }}>
            {summary.count} / {transactions.length} 笔 · 点行编辑
          </span>
        </div>

        {/* 类型 + 排序 */}
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          {(
            [
              { k: 'all' as const, label: '全部' },
              { k: 'expense' as const, label: '支出' },
              { k: 'income' as const, label: '收入' },
            ] as const
          ).map((o) => {
            const active = typeFilter === o.k
            return (
              <button
                key={o.k}
                type="button"
                onClick={() => {
                  setTypeFilter(o.k)
                  setPageSize(PAGE_SIZE)
                }}
                className="rounded-full px-2.5 py-1 text-[11px] transition-all"
                style={{
                  background: active ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                  color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
                  border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
                  fontWeight: active ? 500 : 400,
                }}
              >
                {o.label}
              </button>
            )
          })}
          <span className="mx-1" style={{ color: 'var(--bn-text-tertiary)' }}>
            ·
          </span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full px-2.5 py-1 text-[11px]"
            style={{
              background: 'var(--bn-glass)',
              color: 'var(--bn-text-secondary)',
              border: '0.5px solid var(--bn-glass-border)',
            }}
          >
            <option value="date_desc">最新优先</option>
            <option value="date_asc">最早优先</option>
            <option value="amount_desc">金额大→小</option>
            <option value="amount_asc">金额小→大</option>
          </select>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="ml-auto text-[11px] underline"
              style={{ color: 'var(--bn-text-tertiary)' }}
            >
              清空筛选
            </button>
          )}
        </div>

        {/* 分类 chip */}
        {catsInData.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-1">
            {catsInData.map((c) => {
              const active = selectedCats.has(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCat(c.id)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] transition-all"
                  style={{
                    background: active ? c.color : 'var(--bn-glass)',
                    color: active ? '#FFF' : 'var(--bn-text-secondary)',
                    border: `0.5px solid ${active ? c.color : 'var(--bn-glass-border)'}`,
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  <span>{c.icon}</span>
                  <span>{c.name}</span>
                  <span
                    className="bn-mono ml-0.5 opacity-70"
                    style={{ fontSize: '9.5px' }}
                  >
                    {c.count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* 搜索 */}
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPageSize(PAGE_SIZE)
          }}
          placeholder="搜索商家、明细…"
          className="w-full rounded-lg px-3 py-1.5 text-xs outline-none transition-all focus:ring-2"
          style={{
            background: 'var(--bn-glass)',
            border: '0.5px solid var(--bn-glass-border)',
            color: 'var(--bn-text-primary)',
          }}
        />

        {/* 合计行 */}
        {summary.count > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <span style={{ color: 'var(--bn-text-tertiary)' }}>
              支出{' '}
              <span className="bn-mono" style={{ color: 'var(--bn-text-primary)', fontWeight: 500 }}>
                € {summary.expense.toFixed(2)}
              </span>
            </span>
            {summary.income > 0 && (
              <span style={{ color: 'var(--bn-text-tertiary)' }}>
                收入{' '}
                <span className="bn-mono" style={{ color: 'var(--bn-positive)', fontWeight: 500 }}>
                  € {summary.income.toFixed(2)}
                </span>
              </span>
            )}
            <span style={{ color: 'var(--bn-text-tertiary)' }}>
              净{' '}
              <span
                className="bn-mono"
                style={{
                  color:
                    summary.income - summary.expense >= 0
                      ? 'var(--bn-positive)'
                      : 'var(--bn-negative)',
                  fontWeight: 500,
                }}
              >
                {summary.income - summary.expense >= 0 ? '+' : '−'}€{' '}
                {Math.abs(summary.income - summary.expense).toFixed(2)}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* 列表 */}
      {visible.length === 0 ? (
        <p
          className="py-12 text-center"
          style={{ color: 'var(--bn-text-tertiary)', fontSize: 'var(--bn-text-sm)' }}
        >
          {hasActiveFilter ? '当前筛选下没有交易' : '此区间没有交易'}
        </p>
      ) : (
        <div className="px-2 py-1">
          {visible.map((t, idx) => {
            const cat = t.category_id ? catMap.get(t.category_id) : null
            const dotColor = cat?.color ?? 'var(--bn-text-tertiary)'
            const isIncome = t.type === 'income'

            // note 智能拆分（与 FinancePage 一致）
            const noteParts = (t.note || '')
              .split(/\s*·\s*/)
              .map((s) => s.trim())
              .filter(Boolean)
            const detail = noteParts[0] || ''
            const extras = noteParts.slice(1)

            const primaryText = detail || t.participant?.trim() || '(未填)'

            const subParts: string[] = []
            if (t.participant?.trim() && detail) subParts.push(t.participant)
            if (cat?.name) subParts.push(cat.name)
            else subParts.push('未分类')
            subParts.push(...extras)
            subParts.push(formatShortDate(t.occurred_at))

            return (
              <ListRow
                key={t.id}
                isLast={idx === visible.length - 1 && !hasMore}
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
                      fontSize: 'var(--bn-text-md)',
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

          {hasMore && (
            <button
              type="button"
              onClick={() => setPageSize((s) => s + PAGE_SIZE)}
              className="w-full py-3 text-xs transition-all hover:opacity-80"
              style={{
                color: 'var(--bn-text-tertiary)',
                borderTop: '0.5px solid var(--bn-row-border)',
              }}
            >
              加载更多（还有 {filtered.length - pageSize} 条）
            </button>
          )}
        </div>
      )}

      {editing && (
        <TransactionEditor transaction={editing} onClose={() => setEditing(null)} />
      )}
    </GlassPanel>
  )
}

/** 交易行右下角的紧凑日期 */
function formatShortDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  }
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
}
