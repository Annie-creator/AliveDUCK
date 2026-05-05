import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { shoppingRepo } from '@/repositories'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { completeShoppingItem } from '@/lib/kitchen-flow'

export function ShoppingListPanel() {
  const [name, setName] = useState('')
  const [qty, setQty] = useState(1)
  const [unit, setUnit] = useState('')
  const [autoToPantry, setAutoToPantry] = useState(true)

  const pending = useLiveQuery(
    () => db.shopping_items.filter((s) => !s.deleted_at && !s.done).sortBy('created_at'),
    [],
    [],
  )
  const done = useLiveQuery(
    async () => {
      const arr = await db.shopping_items.filter((s) => !s.deleted_at && s.done).toArray()
      return arr.sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')).slice(0, 20)
    },
    [],
    [],
  )

  async function add() {
    if (!name.trim()) return
    await shoppingRepo.create({
      name: name.trim(),
      category: '',
      quantity: qty,
      unit: unit.trim(),
      done: false,
      done_at: null,
      auto_to_pantry: autoToPantry,
      note: '',
      tag_ids: [],
    })
    setName('')
    setQty(1)
    setUnit('')
  }

  async function toggle(itemId: string, currentlyDone: boolean) {
    const item = pending?.find((p) => p.id === itemId) ?? done?.find((d) => d.id === itemId)
    if (!item) return
    if (currentlyDone) {
      // 重新标为未买
      await shoppingRepo.update(itemId, { done: false, done_at: null })
    } else {
      await completeShoppingItem(item, item.auto_to_pantry)
    }
  }

  async function removeItem(id: string) {
    await shoppingRepo.softDelete(id)
  }

  return (
    <div className="space-y-4">
      {/* 添加 */}
      <GlassPanel padding="md" radius="lg">
        <p className="mb-2 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          快速添加
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Input
            placeholder="物品名(如:牛奶)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            className="flex-1 min-w-[140px]"
          />
          <input
            type="number"
            min={1}
            step="0.5"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value) || 1)}
            className="bn-mono w-16 rounded-lg px-2 py-1.5 text-sm"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
              color: 'var(--bn-text-primary)',
            }}
          />
          <Input
            placeholder="单位"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-16"
          />
          <Button onClick={add} disabled={!name.trim()}>添加</Button>
        </div>
        <label className="mt-2 flex items-center gap-1.5 text-[11px] cursor-pointer"
          style={{ color: 'var(--bn-text-secondary)' }}>
          <input
            type="checkbox"
            checked={autoToPantry}
            onChange={(e) => setAutoToPantry(e.target.checked)}
          />
          买完自动入库存
        </label>
      </GlassPanel>

      {/* 待买 */}
      <GlassPanel padding="md" radius="lg" variant="strong">
        <h3 className="mb-2 text-sm font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          待买 · {(pending ?? []).length} 项
        </h3>
        {(pending ?? []).length === 0 ? (
          <p className="py-4 text-center text-xs" style={{ color: 'var(--bn-text-tertiary)' }}>
            清单空了 ✓
          </p>
        ) : (
          <div className="space-y-1">
            {(pending ?? []).map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-white/10"
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => toggle(item.id, false)}
                />
                <span className="flex-1 text-sm" style={{ color: 'var(--bn-text-primary)' }}>
                  {item.name}
                </span>
                <span className="bn-mono text-xs"
                  style={{ color: 'var(--bn-text-tertiary)' }}>
                  {item.quantity}{item.unit && ` ${item.unit}`}
                </span>
                {item.note && (
                  <span className="text-[10px]"
                    style={{ color: 'var(--bn-text-tertiary)' }}
                    title={item.note}>
                    📝
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: 'var(--bn-text-tertiary)', fontSize: '11px' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* 已完成(20 条最近)*/}
      {(done ?? []).length > 0 && (
        <GlassPanel padding="md" radius="lg">
          <h3 className="mb-2 text-sm font-medium" style={{ color: 'var(--bn-text-tertiary)' }}>
            已完成 · 最近 {Math.min((done ?? []).length, 20)} 条
          </h3>
          <div className="space-y-0.5">
            {(done ?? []).map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 py-0.5"
                style={{ color: 'var(--bn-text-tertiary)' }}
              >
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => toggle(item.id, true)}
                />
                <span className="flex-1 text-xs line-through">
                  {item.name}
                </span>
                <span className="bn-mono text-[10px]">
                  {item.quantity}{item.unit && ` ${item.unit}`}
                </span>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}
    </div>
  )
}
