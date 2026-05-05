import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { financeRepo } from '@/repositories'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { rateToBase, getBaseCurrency, getRates, DEFAULT_BASE, DEFAULT_RATES, SUPPORTED_CURRENCIES } from '@/lib/currency'
import { classifyOne } from '@/lib/classifier'

const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES

export function QuickEntryForm() {
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [participant, setParticipant] = useState('')
  const [note, setNote] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')

  const categories = useLiveQuery(
    () => db.categories.filter((c) => !c.deleted_at && !c.archived).sortBy('sort_order'),
    [],
    [],
  )

  const filteredCats = useMemo(
    () => (categories ?? []).filter((c) => c.kind === type),
    [categories, type],
  )

  // 智能推断 — 用户输入商家名后自动建议分类
  const suggestedCatId = useMemo(() => {
    if (categoryId || !participant.trim() || !filteredCats.length) return null
    const nameToId: Record<string, string> = {}
    for (const c of filteredCats) nameToId[c.name] = c.id
    return classifyOne(participant, note, {}, nameToId)
  }, [participant, note, filteredCats, categoryId])

  const effectiveCatId = categoryId || suggestedCatId || ''

  async function handleAdd() {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return

    const base = await getBaseCurrency().catch(() => DEFAULT_BASE)
    const rates = await getRates().catch(() => DEFAULT_RATES)
    const exchange_rate = rateToBase(currency, base, rates)

    await financeRepo.create({
      type,
      occurred_at: new Date().toISOString(),
      amount: n,
      currency,
      exchange_rate,
      category_id: effectiveCatId || null,
      from_account_id: null,
      to_account_id: null,
      participant: participant.trim(),
      note: note.trim(),
      tag_ids: [],
    })
    setAmount('')
    setParticipant('')
    setNote('')
    setCategoryId('')
  }

  return (
    <GlassPanel padding="lg" radius="lg" variant="strong">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          快速记一笔
        </h2>
        <div className="flex gap-1 rounded-full p-0.5"
          style={{ background: 'var(--bn-glass)', border: '0.5px solid var(--bn-glass-border)' }}>
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              className="rounded-full px-3 py-1 text-[11px] transition-all"
              style={{
                background: type === k ? 'var(--bn-glass-strong)' : 'transparent',
                color: type === k ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
                fontWeight: type === k ? 500 : 400,
                boxShadow: type === k
                  ? '0 1px 2px rgba(0,0,0,0.08), inset 0 0 0 0.5px var(--bn-glass-border)'
                  : 'none',
              }}
            >
              {k === 'expense' ? '支出' : '收入'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="flex gap-2">
          <Input
            type="number"
            step="0.01"
            placeholder="金额"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1"
          />
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="rounded-lg px-2.5 text-sm bn-mono"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
              color: 'var(--bn-text-primary)',
              minWidth: '70px',
            }}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <Input
          placeholder="商家 / 对象"
          value={participant}
          onChange={(e) => setParticipant(e.target.value)}
        />
      </div>

      <Input
        className="mt-2.5"
        placeholder="备注"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {filteredCats.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {filteredCats.map((c) => {
            const active = effectiveCatId === c.id
            const isSuggested = !categoryId && c.id === suggestedCatId
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(active ? '' : c.id)}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-all"
                style={{
                  background: active ? c.color : 'var(--bn-glass)',
                  color: active ? '#FFF' : 'var(--bn-text-secondary)',
                  border: `0.5px solid ${active ? c.color : 'var(--bn-glass-border)'}`,
                  opacity: isSuggested && !active ? 1 : active ? 1 : 0.85,
                  outline: isSuggested && !active ? `1px dashed ${c.color}` : 'none',
                  outlineOffset: '1px',
                }}
                title={isSuggested ? '智能推荐' : undefined}
              >
                <span>{c.icon}</span>
                <span>{c.name}</span>
              </button>
            )
          })}
        </div>
      )}

      <Button className="mt-3" onClick={handleAdd} disabled={!amount}>
        添加 {type === 'expense' ? '支出' : '收入'}
      </Button>
    </GlassPanel>
  )
}
