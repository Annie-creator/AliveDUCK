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

/** 把 Date 格式化为 <input type="date"> 需要的 YYYY-MM-DD（本地时区） */
function todayLocalIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function QuickEntryForm() {
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [participant, setParticipant] = useState('')
  const [note, setNote] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  // 发生日期 —— 默认今天，用户可往前选；时间永远跟当前时刻走（保留录入顺序）
  const [date, setDate] = useState<string>(todayLocalIso)

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

  const today = todayLocalIso()
  const isToday = date === today
  // 友好标签
  const dateBadgeLabel = useMemo(() => {
    if (!date) return ''
    const [y, m, d] = date.split('-').map(Number)
    if (!y || !m || !d) return date
    const picked = new Date(y, m - 1, d)
    const now = new Date()
    const diffDays = Math.round(
      (picked.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
        86_400_000,
    )
    if (diffDays === 0) return '今天'
    if (diffDays === -1) return '昨天'
    if (diffDays === -2) return '前天'
    if (diffDays < 0 && diffDays >= -6) return `${-diffDays} 天前`
    // 同年只显示 月/日
    if (picked.getFullYear() === now.getFullYear()) {
      return `${picked.getMonth() + 1}月${picked.getDate()}日`
    }
    return `${picked.getFullYear()}-${String(picked.getMonth() + 1).padStart(2, '0')}-${String(picked.getDate()).padStart(2, '0')}`
  }, [date])

  async function handleAdd() {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return

    const base = await getBaseCurrency().catch(() => DEFAULT_BASE)
    const rates = await getRates().catch(() => DEFAULT_RATES)
    const exchange_rate = rateToBase(currency, base, rates)

    // 把选中的日期 + 现在的时分秒 拼成 ISO（保证当天多条按录入顺序排）
    const [y, m, d] = date.split('-').map(Number)
    const now = new Date()
    const occurredAt = new Date(
      y ?? now.getFullYear(),
      (m ?? now.getMonth() + 1) - 1,
      d ?? now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    ).toISOString()

    await financeRepo.create({
      type,
      occurred_at: occurredAt,
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
    setDate(todayLocalIso()) // 提交后回到今天
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
        placeholder="详细信息"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {/* 发生日期 —— 默认今天，可往前选 */}
      <div className="mt-2.5 flex items-center gap-2">
        <label
          className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all focus-within:ring-2"
          style={{
            background: 'var(--bn-glass)',
            border: '0.5px solid var(--bn-glass-border)',
            color: 'var(--bn-text-secondary)',
          }}
        >
          <span style={{ fontSize: 'var(--bn-text-xs)', color: 'var(--bn-text-tertiary)' }}>
            发生日期
          </span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value || today)}
            className="bn-mono flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--bn-text-primary)' }}
          />
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px]"
            style={{
              background: isToday ? 'var(--bn-glass)' : 'var(--bn-glass-strong)',
              color: isToday ? 'var(--bn-text-tertiary)' : 'var(--bn-text-primary)',
              border: `0.5px solid ${isToday ? 'var(--bn-glass-border)' : 'var(--bn-accent)'}`,
              fontWeight: isToday ? 400 : 500,
            }}
          >
            {dateBadgeLabel}
          </span>
        </label>
        {!isToday && (
          <button
            type="button"
            onClick={() => setDate(today)}
            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-all"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
              color: 'var(--bn-text-tertiary)',
            }}
          >
            回到今天
          </button>
        )}
      </div>

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
        {!isToday && <span className="ml-1 opacity-70">· {dateBadgeLabel}</span>}
      </Button>
    </GlassPanel>
  )
}
