import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { financeRepo } from '@/repositories'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { FinanceTransaction } from '@/types'
import { SUPPORTED_CURRENCIES } from '@/lib/currency'

interface Props {
  transaction: FinanceTransaction
  onClose: () => void
}

const COMMON_CURRENCIES = SUPPORTED_CURRENCIES

export function TransactionEditor({ transaction, onClose }: Props) {
  const [type, setType] = useState<'income' | 'expense'>(
    transaction.type === 'transfer' ? 'expense' : transaction.type,
  )
  const [amount, setAmount] = useState(String(transaction.amount))
  const [currency, setCurrency] = useState(transaction.currency)
  const [participant, setParticipant] = useState(transaction.participant)
  const [note, setNote] = useState(transaction.note)
  const [categoryId, setCategoryId] = useState(transaction.category_id ?? '')
  const [date, setDate] = useState(() => transaction.occurred_at.slice(0, 10))
  const [time, setTime] = useState(() => {
    const d = new Date(transaction.occurred_at)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })

  const allCategories = useLiveQuery(
    () => db.categories.filter((c) => !c.deleted_at).toArray(),
    [],
    [],
  )
  const categories = (allCategories ?? []).filter((c) => c.kind === type)

  // 类型变化时,如果当前 cat 不属于这个 type,就清空
  useEffect(() => {
    if (categoryId) {
      const cat = (allCategories ?? []).find((c) => c.id === categoryId)
      if (cat && cat.kind !== type) {
        setCategoryId('')
      }
    }
  }, [type, categoryId, allCategories])

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    const num = Number(amount)
    if (!Number.isFinite(num) || num <= 0) return

    const [y, m, d] = date.split('-').map(Number)
    const [h, mi] = time.split(':').map(Number)
    const occurred = new Date(y!, m! - 1, d!, h ?? 0, mi ?? 0).toISOString()

    await financeRepo.update(transaction.id, {
      type,
      amount: num,
      currency,
      participant: participant.trim(),
      note: note.trim(),
      category_id: categoryId || null,
      occurred_at: occurred,
    })
    onClose()
  }

  async function remove() {
    if (!confirm('确认删除这笔交易?')) return
    await financeRepo.softDelete(transaction.id)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-5"
        style={{
          background: 'var(--bn-bg)',
          border: '0.5px solid var(--bn-glass-border)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
            编辑交易
          </h2>
          <button type="button" onClick={onClose} className="text-sm"
            style={{ color: 'var(--bn-text-tertiary)' }}>
            ✕
          </button>
        </div>

        {/* 类型 */}
        <div className="flex gap-1 rounded-full p-0.5"
          style={{ background: 'var(--bn-glass)', border: '0.5px solid var(--bn-glass-border)' }}>
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              className="flex-1 rounded-full px-3 py-1.5 text-xs transition-all"
              style={{
                background: type === k ? 'var(--bn-glass-strong)' : 'transparent',
                color: type === k ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
                fontWeight: type === k ? 500 : 400,
                boxShadow: type === k ? 'inset 0 0 0 0.5px var(--bn-accent)' : 'none',
              }}
            >
              {k === 'expense' ? '支出' : '收入'}
            </button>
          ))}
        </div>

        {/* 金额 + 币种 */}
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="金额"
            className="bn-mono flex-1 rounded-lg px-3 py-2 text-base"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
              color: 'var(--bn-text-primary)',
            }}
          />
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="bn-mono rounded-lg px-3 py-2 text-sm"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
              color: 'var(--bn-text-primary)',
            }}
          >
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* 明细(主标题位)*/}
        <p className="mb-1 mt-3 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          明细(必填)
        </p>
        <Input
          placeholder="买了什么 / 这笔钱是什么用途"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {/* 商家(副标题位)*/}
        <p className="mb-1 mt-3 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          商家 / 对象(可选)
        </p>
        <Input
          placeholder="如 Mercadona / Renfe / 房东老李"
          value={participant}
          onChange={(e) => setParticipant(e.target.value)}
        />

        {/* 分类 */}
        <p className="mb-1 mt-3 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          分类
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryId('')}
            className="rounded-full px-2.5 py-1 text-[11px] transition-all"
            style={{
              background: !categoryId ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
              color: !categoryId ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
              border: `0.5px solid ${!categoryId ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
            }}
          >
            未分类
          </button>
          {categories.map((c) => {
            const active = c.id === categoryId
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className="rounded-full px-2.5 py-1 text-[11px] transition-all"
                style={{
                  background: active ? `${c.color}30` : 'var(--bn-glass)',
                  color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
                  border: `0.5px solid ${active ? c.color : 'var(--bn-glass-border)'}`,
                }}
              >
                {c.icon} {c.name}
              </button>
            )
          })}
        </div>

        {/* 日期时间 */}
        <p className="mb-1 mt-3 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          发生时间
        </p>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-sm"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
              color: 'var(--bn-text-primary)',
            }}
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="bn-mono rounded-lg px-2.5 py-1.5 text-sm"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
              color: 'var(--bn-text-primary)',
            }}
          />
        </div>

        {/* 操作 */}
        <div className="mt-5 flex items-center gap-2">
          <Button onClick={save} disabled={!Number(amount)}>保存</Button>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="ghost" onClick={remove} className="ml-auto">
            <span style={{ color: 'var(--bn-negative)' }}>删除</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
