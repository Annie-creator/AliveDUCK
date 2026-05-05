import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { settingsRepo } from '@/repositories'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toBaseAmount } from '@/lib/currency'
import { resolveTimeRange } from '@/lib/finance-stats'

const BUDGET_KEY = 'monthly_budget'

/**
 * 月度预算进度组件。
 *
 * 关键设计:用 useLiveQuery 订阅 settings 表 + finance_transactions 表。
 * 这意味着任何地方(本页 / 分析页 / 设置页)写入预算或新增流水,
 * 所有显示这个组件的地方都会自动刷新 —— 单一数据源、零手动通知。
 *
 * 之前用 useState + useEffect 的版本是错的:多个实例各持一份 state,
 * 改一处不会通知另一处。
 */
export function BudgetProgress() {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // ── 响应式预算 ──────────────────────────────────────────────
  // 订阅 settings 表里 key='monthly_budget' 的那一行
  const budget = useLiveQuery(async () => {
    const v = await settingsRepo.getValue<number>(BUDGET_KEY)
    return v ?? null
  }, [], null)

  // ── 响应式本月支出 ──────────────────────────────────────────
  const range = resolveTimeRange('this_month')
  const monthExpense = useLiveQuery(async () => {
    const txs = await db.finance_transactions
      .filter(
        (t) =>
          !t.deleted_at &&
          t.type === 'expense' &&
          t.occurred_at >= range.startIso &&
          t.occurred_at < range.endIso,
      )
      .toArray()
    return txs.reduce((s, t) => s + toBaseAmount(t.amount, t.exchange_rate), 0)
  }, [range.startIso, range.endIso], 0)

  async function saveBudget() {
    const n = Number(draft)
    if (!Number.isFinite(n) || n < 0) return
    await settingsRepo.setValue(BUDGET_KEY, n)
    setEditing(false)
    // 不需要手动 setBudget —— useLiveQuery 自动会拿到新值
  }

  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysLeft = Math.max(daysInMonth - now.getDate() + 1, 1)
  const remaining = budget !== null ? Math.max(budget - monthExpense, 0) : 0
  const dailyAllowance = budget !== null ? remaining / daysLeft : 0
  const ratio = budget && budget > 0 ? Math.min(monthExpense / budget, 1.5) : 0

  // useLiveQuery 启动期 budget 是 null(初值),也是"没有预算"。
  // 用 undefined 区分"还在加载"和"加载完了但确实没设":这里我们让 null 当"没设"。
  if (budget === null && !editing) {
    return (
      <GlassPanel padding="lg" radius="lg">
        <h2 className="mb-1 text-base font-medium"
          style={{ color: 'var(--bn-text-primary)' }}>
          月度预算
        </h2>
        <p className="mb-3 text-xs"
          style={{ color: 'var(--bn-text-secondary)' }}>
          设一个本月预算,系统会按剩余天数算出每天还能花多少。
        </p>
        <Button onClick={() => { setDraft('1200'); setEditing(true) }}>
          设置预算
        </Button>
      </GlassPanel>
    )
  }

  if (editing) {
    return (
      <GlassPanel padding="lg" radius="lg">
        <h2 className="mb-3 text-base font-medium"
          style={{ color: 'var(--bn-text-primary)' }}>
          设置月度预算
        </h2>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="金额"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button onClick={saveBudget}>保存</Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>取消</Button>
        </div>
      </GlassPanel>
    )
  }

  // 颜色:超过 80% 黄,超过 100% 红
  const barColor = ratio >= 1
    ? 'var(--bn-negative)'
    : ratio >= 0.8
      ? '#E0A75F'
      : 'var(--bn-positive)'

  return (
    <GlassPanel padding="lg" radius="lg">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-base font-medium"
          style={{ color: 'var(--bn-text-primary)' }}>
          本月预算进度
        </h2>
        <button
          type="button"
          onClick={() => { setDraft(String(budget ?? '')); setEditing(true) }}
          className="text-[11px] underline"
          style={{ color: 'var(--bn-text-tertiary)' }}
        >
          调整
        </button>
      </div>

      <div className="mb-2 flex items-baseline gap-2">
        <span className="bn-mono text-xl font-medium"
          style={{ color: 'var(--bn-text-primary)' }}>
          € {monthExpense.toFixed(2)}
        </span>
        <span className="text-xs"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          / € {(budget ?? 0).toFixed(2)}
        </span>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--bn-glass)' }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{
            width: `${Math.min(ratio * 100, 100)}%`,
            background: barColor,
          }}
        />
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--bn-text-tertiary)' }}>剩余</p>
          <p className="bn-mono mt-0.5 font-medium"
            style={{ color: 'var(--bn-text-primary)' }}>
            € {remaining.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--bn-text-tertiary)' }}>剩余天数</p>
          <p className="bn-mono mt-0.5 font-medium"
            style={{ color: 'var(--bn-text-primary)' }}>
            {daysLeft} 天
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--bn-text-tertiary)' }}>日均还能花</p>
          <p className="bn-mono mt-0.5 font-medium"
            style={{ color: 'var(--bn-text-primary)' }}>
            € {dailyAllowance.toFixed(2)}
          </p>
        </div>
      </div>
    </GlassPanel>
  )
}
