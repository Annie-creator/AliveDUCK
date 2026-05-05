import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { pantryRepo } from '@/repositories'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getPantryAlerts, rebuyPantryItem, type PantryAlert } from '@/lib/kitchen-flow'
import type { PantryItem } from '@/types'

export function PantryPanel() {
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null)
  const [adding, setAdding] = useState(false)
  const [alerts, setAlerts] = useState<PantryAlert[]>([])

  const items = useLiveQuery(
    () => db.pantry_items.filter((p) => !p.deleted_at).sortBy('name'),
    [],
    [],
  )

  // 重新计算 alerts(items 变化时)
  useEffect(() => {
    void getPantryAlerts().then(setAlerts)
  }, [items])

  return (
    <div className="space-y-4">
      {/* 警报 */}
      {alerts.length > 0 && (
        <GlassPanel
          padding="md"
          radius="lg"
          style={{ borderLeft: '3px solid var(--bn-accent)' }}
        >
          <h3 className="mb-2 text-sm font-medium" style={{ color: 'var(--bn-text-primary)' }}>
            ⚠ 需要关注
          </h3>
          <div className="space-y-1">
            {alerts.map((a) => (
              <div key={a.item.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate"
                  style={{ color: 'var(--bn-text-primary)' }}>
                  {a.item.name}
                </span>
                <span className="bn-mono"
                  style={{
                    color:
                      a.reason === 'expired' ? 'var(--bn-negative)'
                        : a.reason === 'expires_soon' ? '#E0A75F'
                          : 'var(--bn-text-tertiary)',
                  }}>
                  {a.reason === 'expired' ? '已过期'
                    : a.reason === 'expires_soon' ? `${a.daysLeft} 天后过期`
                      : `仅剩 ${a.item.quantity}${a.item.unit}`}
                </span>
                <button
                  type="button"
                  onClick={() => rebuyPantryItem(a.item)}
                  className="text-[10px] underline"
                  style={{ color: 'var(--bn-text-tertiary)' }}
                >
                  补货
                </button>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      <div className="flex items-center justify-end">
        <Button onClick={() => setAdding(true)}>+ 入库</Button>
      </div>

      {(items ?? []).length === 0 ? (
        <GlassPanel padding="lg" radius="lg">
          <p className="py-6 text-center text-sm" style={{ color: 'var(--bn-text-tertiary)' }}>
            库存为空。买完东西自动入库,或点上面手动加。
          </p>
        </GlassPanel>
      ) : (
        <GlassPanel padding="md" radius="lg" variant="strong">
          <div className="space-y-1">
            {(items ?? []).map((p) => {
              const isLow = p.quantity <= p.low_threshold
              const exp = p.expires_on ? new Date(p.expires_on) : null
              const isExpired = exp && exp.getTime() < Date.now()
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setEditingItem(p)}
                  className="flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors hover:bg-white/10"
                >
                  <span className="flex-1 truncate text-sm"
                    style={{
                      color: 'var(--bn-text-primary)',
                      textDecoration: isExpired ? 'line-through' : 'none',
                    }}>
                    {p.name}
                  </span>
                  {p.category && (
                    <span className="text-[10px]"
                      style={{ color: 'var(--bn-text-tertiary)' }}>
                      {p.category}
                    </span>
                  )}
                  <span className="bn-mono text-xs"
                    style={{ color: isLow ? '#E0A75F' : 'var(--bn-text-secondary)' }}>
                    {p.quantity}{p.unit && ` ${p.unit}`}
                  </span>
                  {exp && (
                    <span className="bn-mono text-[10px]"
                      style={{ color: isExpired ? 'var(--bn-negative)' : 'var(--bn-text-tertiary)' }}>
                      {exp.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </GlassPanel>
      )}

      {(adding || editingItem) && (
        <PantryEditor
          item={editingItem}
          onClose={() => {
            setEditingItem(null)
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}

function PantryEditor({ item, onClose }: { item: PantryItem | null; onClose: () => void }) {
  const isNew = item === null
  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState(item?.category ?? '')
  const [quantity, setQuantity] = useState(item?.quantity ?? 1)
  const [unit, setUnit] = useState(item?.unit ?? '')
  const [lowThreshold, setLowThreshold] = useState(item?.low_threshold ?? 1)
  const [expires, setExpires] = useState(
    item?.expires_on ? item.expires_on.slice(0, 10) : '',
  )
  const [note, setNote] = useState(item?.note ?? '')

  async function save() {
    if (!name.trim()) return
    const payload = {
      name: name.trim(),
      category: category.trim(),
      quantity,
      unit: unit.trim(),
      low_threshold: lowThreshold,
      expires_on: expires ? new Date(expires + 'T23:59:59').toISOString() : null,
      note: note.trim(),
      tag_ids: [],
    }
    if (isNew) {
      await pantryRepo.create(payload)
    } else {
      await pantryRepo.update(item!.id, payload)
    }
    onClose()
  }

  async function remove() {
    if (!item) return
    if (!confirm('从库存移除?')) return
    await pantryRepo.softDelete(item.id)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5"
        style={{
          background: 'var(--bn-bg)',
          border: '0.5px solid var(--bn-glass-border)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <h2 className="mb-3 text-base font-medium"
          style={{ color: 'var(--bn-text-primary)' }}>
          {isNew ? '入库' : '编辑库存'}
        </h2>

        <Input placeholder="物品名" value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} />
        <Input className="mt-2" placeholder="分类(可选,如 调料/蔬菜)" value={category} onChange={(e) => setCategory(e.target.value)} />

        <div className="mt-2 grid grid-cols-3 gap-2">
          <NumIn label="数量" value={quantity} onChange={setQuantity} step={0.5} />
          <div>
            <p className="mb-0.5 text-[10px]" style={{ color: 'var(--bn-text-tertiary)' }}>单位</p>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g / 个" />
          </div>
          <NumIn label="低库存阈值" value={lowThreshold} onChange={setLowThreshold} step={0.5} />
        </div>

        <div className="mt-2">
          <p className="mb-0.5 text-[10px]" style={{ color: 'var(--bn-text-tertiary)' }}>过期日期(可选)</p>
          <input
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-sm"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
              color: 'var(--bn-text-primary)',
            }}
          />
        </div>

        <Input className="mt-2" placeholder="备注" value={note} onChange={(e) => setNote(e.target.value)} />

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={save} disabled={!name.trim()}>{isNew ? '入库' : '保存'}</Button>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          {!isNew && (
            <Button variant="ghost" onClick={remove} className="ml-auto">
              <span style={{ color: 'var(--bn-negative)' }}>删除</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function NumIn({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <p className="mb-0.5 text-[10px]" style={{ color: 'var(--bn-text-tertiary)' }}>{label}</p>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="bn-mono w-full rounded-lg px-2 py-1.5 text-sm"
        style={{
          background: 'var(--bn-glass)',
          border: '0.5px solid var(--bn-glass-border)',
          color: 'var(--bn-text-primary)',
        }}
      />
    </div>
  )
}
