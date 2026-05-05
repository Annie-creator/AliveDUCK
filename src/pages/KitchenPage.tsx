import { useState } from 'react'
import { MealPlannerPanel } from '@/components/recipes/MealPlannerPanel'
import { ShoppingListPanel } from '@/components/shopping/ShoppingListPanel'
import { PantryPanel } from '@/components/shopping/PantryPanel'

type Tab = 'plan' | 'shopping' | 'pantry'

export function KitchenPage() {
  const [tab, setTab] = useState<Tab>('plan')

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: 'var(--bn-text-secondary)' }}>
          KITCHEN
        </p>
        <h1 className="text-[30px] leading-[1.15]"
          style={{
            color: 'var(--bn-text-primary)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
          }}>
          厨房
          <span className="ml-2"
            style={{
              color: 'var(--bn-text-tertiary)',
              fontWeight: 300,
              letterSpacing: '-0.02em',
            }}>
            吃啥 / 买啥 / 还有啥
          </span>
        </h1>
      </div>

      <div className="flex gap-1 rounded-full p-0.5 self-start"
        style={{
          background: 'var(--bn-glass)',
          border: '0.5px solid var(--bn-glass-border)',
          width: 'fit-content',
        }}>
        {([
          { key: 'plan' as const, label: '🍽 用餐预订' },
          { key: 'shopping' as const, label: '🛒 购物清单' },
          { key: 'pantry' as const, label: '📦 库存' },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="rounded-full px-3 py-1 text-[12px] transition-all"
            style={{
              background: tab === t.key ? 'var(--bn-glass-strong)' : 'transparent',
              color: tab === t.key ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
              fontWeight: tab === t.key ? 500 : 400,
              boxShadow: tab === t.key ? 'inset 0 0 0 0.5px var(--bn-accent)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'plan' && <MealPlannerPanel />}
      {tab === 'shopping' && <ShoppingListPanel />}
      {tab === 'pantry' && <PantryPanel />}
    </div>
  )
}
