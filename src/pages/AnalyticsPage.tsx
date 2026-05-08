import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { TimeFilter } from '@/components/finance/TimeFilter'
import { BudgetProgress } from '@/components/finance/BudgetProgress'
import { MonthlyTrendChart } from '@/components/finance/MonthlyTrendChart'
import { CategoryDonutChart } from '@/components/finance/CategoryDonutChart'
import { MerchantRanking } from '@/components/finance/MerchantRanking'
import { ExportButton } from '@/components/finance/ExportButton'
import { TransactionList } from '@/components/finance/TransactionList'
import { settingsRepo } from '@/repositories'
import {
  groupByCategory,
  groupByMonth,
  groupByParticipant,
  periodStats,
  resolveTimeRange,
  type TimeRangePreset,
} from '@/lib/finance-stats'
import { ensureDefaults } from '@/lib/seed-defaults'
import { backfillCategories } from '@/lib/classifier'

type Tab = 'overview' | 'category' | 'merchant' | 'trend' | 'transactions'

export function AnalyticsPage() {
  const [preset, setPreset] = useState<TimeRangePreset>('this_month')
  const [tab, setTab] = useState<Tab>('overview')
  const [seedReport, setSeedReport] = useState<string | null>(null)
  const [backfillReport, setBackfillReport] = useState<string | null>(null)

  // 第一次进页面时确保默认分类已 seed
  useEffect(() => {
    void (async () => {
      const r = await ensureDefaults()
      if (r.seededCategories > 0 || r.seededAccounts > 0) {
        setSeedReport(`已初始化 ${r.seededCategories} 个分类、${r.seededAccounts} 个账户`)
        setTimeout(() => setSeedReport(null), 4000)
      }
    })()
  }, [])

  const range = useMemo(() => resolveTimeRange(preset), [preset])

  const txs = useLiveQuery(
    () =>
      db.finance_transactions
        .filter(
          (t) => !t.deleted_at && t.occurred_at >= range.startIso && t.occurred_at < range.endIso,
        )
        .toArray(),
    [range.startIso, range.endIso],
    [],
  )

  // 全量 transactions 给月度趋势用(忽略时间筛选)
  const allTxs = useLiveQuery(
    () => db.finance_transactions.filter((t) => !t.deleted_at).toArray(),
    [],
    [],
  )

  const categories = useLiveQuery(
    () => db.categories.filter((c) => !c.deleted_at).toArray(),
    [],
    [],
  )

  const stats = useMemo(() => periodStats(txs ?? []), [txs])
  const catGroups = useMemo(
    () => groupByCategory(txs ?? [], categories ?? []),
    [txs, categories],
  )
  const partGroups = useMemo(() => groupByParticipant(txs ?? []), [txs])
  const monthGroups = useMemo(() => groupByMonth(allTxs ?? []), [allTxs])

  // 月预算(响应式)
  const budget = useLiveQuery(
    async () => (await settingsRepo.getValue<number>('monthly_budget')) ?? 0,
    [],
    0,
  )

  const days = Math.max(
    1,
    Math.round(
      (new Date(range.endIso).getTime() - new Date(range.startIso).getTime()) / 86_400_000,
    ),
  )
  const dailyAvg = stats.expense / days
  // 可花余额 = 预算 + 收入 − 支出
  // 仅在 this_month 视图下显示;别的时间段不显示("可花"概念是针对预算月的)
  const showAvailable = preset === 'this_month' && (budget ?? 0) > 0
  const available = (budget ?? 0) + stats.income - stats.expense

  async function handleBackfill() {
    setBackfillReport('归类中…')
    const r = await backfillCategories()
    if (r.classified === 0) {
      setBackfillReport(`扫描了 ${r.totalScanned} 条未归类记录,没有匹配到任何规则。`)
    } else {
      const detail = Object.entries(r.byCategory)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ')
      setBackfillReport(`✓ 归类了 ${r.classified} / ${r.totalScanned} 条 · ${detail}`)
    }
    setTimeout(() => setBackfillReport(null), 8000)
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: 'var(--bn-text-secondary)' }}>
          ANALYTICS
        </p>
        <h1 className="text-[30px] leading-[1.15]"
          style={{
            color: 'var(--bn-text-primary)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
          }}>
          钱去哪儿了
          <span className="ml-2"
            style={{
              color: 'var(--bn-text-tertiary)',
              fontWeight: 300,
              letterSpacing: '-0.02em',
            }}>
            {range.label}一目了然
          </span>
        </h1>
      </div>

      {seedReport && (
        <p className="text-xs" style={{ color: 'var(--bn-positive)' }}>
          {seedReport}
        </p>
      )}

      <TimeFilter value={preset} onChange={setPreset} />

      <BudgetProgress />

      {/* 总览数字 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="总支出" value={`€ ${stats.expense.toFixed(2)}`} />
        <Stat label="总收入" value={`€ ${stats.income.toFixed(2)}`}
          tone={stats.income > 0 ? 'positive' : 'neutral'} />
        {showAvailable ? (
          <Stat label="本月还能花"
            value={`${available >= 0 ? '' : '−'}€ ${Math.abs(available).toFixed(2)}`}
            tone={available >= 0 ? 'positive' : 'negative'} />
        ) : (
          <Stat label="净结余"
            value={`${stats.balance >= 0 ? '+' : '−'}€ ${Math.abs(stats.balance).toFixed(2)}`}
            tone={stats.balance >= 0 ? 'positive' : 'negative'} />
        )}
        <Stat label={`日均(${days}天)`} value={`€ ${dailyAvg.toFixed(2)}`} />
      </div>

      {/* tab 切换 */}
      <div className="flex flex-wrap gap-1.5">
        {([
          { key: 'overview', label: '总览' },
          { key: 'category', label: '按分类' },
          { key: 'merchant', label: '按商家' },
          { key: 'trend', label: '月度趋势' },
          { key: 'transactions', label: '明细' },
        ] as Array<{ key: Tab; label: string }>).map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="rounded-full px-3.5 py-1.5 text-xs transition-all"
              style={{
                background: active ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
                border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
                fontWeight: active ? 500 : 400,
                boxShadow: active ? 'inset 0 0 0 0.5px var(--bn-accent)' : 'none',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && (
        <>
          <GlassPanel padding="lg" radius="lg">
            <h2 className="mb-3 text-base font-medium"
              style={{ color: 'var(--bn-text-primary)' }}>
              分类分布
            </h2>
            <CategoryDonutChart data={catGroups} categories={categories ?? []} />
          </GlassPanel>
          <GlassPanel padding="lg" radius="lg">
            <h2 className="mb-3 text-base font-medium"
              style={{ color: 'var(--bn-text-primary)' }}>
              Top 商家
            </h2>
            <MerchantRanking data={partGroups} topN={5} />
          </GlassPanel>
        </>
      )}

      {tab === 'category' && (
        <GlassPanel padding="lg" radius="lg">
          <CategoryDonutChart data={catGroups} categories={categories ?? []} />
          <div className="mt-4 border-t pt-3"
            style={{ borderColor: 'var(--bn-row-border)' }}>
            <p className="mb-2 text-[11px] uppercase tracking-wider"
              style={{ color: 'var(--bn-text-tertiary)' }}>
              详细列表
            </p>
            {catGroups.filter((g) => g.expense > 0).map((g) => (
              <div key={g.key}
                className="flex items-center justify-between py-1.5 text-sm"
                style={{ borderBottom: '0.5px solid var(--bn-row-border)' }}>
                <span style={{ color: 'var(--bn-text-primary)' }}>{g.label}</span>
                <span className="bn-mono" style={{ color: 'var(--bn-text-secondary)' }}>
                  € {g.expense.toFixed(2)} · {g.count} 笔
                </span>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      {tab === 'merchant' && (
        <GlassPanel padding="lg" radius="lg">
          <MerchantRanking data={partGroups} topN={20} />
        </GlassPanel>
      )}

      {tab === 'trend' && (
        <GlassPanel padding="lg" radius="lg">
          <h2 className="mb-1 text-base font-medium"
            style={{ color: 'var(--bn-text-primary)' }}>
            按月趋势(全部数据)
          </h2>
          <p className="mb-3 text-xs" style={{ color: 'var(--bn-text-tertiary)' }}>
            折算到本位币
          </p>
          <MonthlyTrendChart data={monthGroups} />
        </GlassPanel>
      )}

      {tab === 'transactions' && (
        <TransactionList
          transactions={txs ?? []}
          categories={categories ?? []}
          title={`${range.label}的全部交易`}
        />
      )}

      {/* 数据治理 */}
      <GlassPanel padding="lg" radius="lg">
        <h2 className="mb-1 text-base font-medium"
          style={{ color: 'var(--bn-text-primary)' }}>
          数据工具
        </h2>
        <p className="mb-3 text-xs"
          style={{ color: 'var(--bn-text-secondary)' }}>
          智能归类:扫描所有未分类的支出,根据商家名自动归类(Mercadona → 食杂,Renfe → 交通…)。
          已经手动归类过的不会被覆盖。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleBackfill}
            className="rounded-full px-4 py-1.5 text-xs"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
              color: 'var(--bn-text-primary)',
            }}
          >
            重新归类历史数据
          </button>
          <ExportButton />
        </div>
        {backfillReport && (
          <p className="mt-3 text-xs" style={{ color: 'var(--bn-text-secondary)' }}>
            {backfillReport}
          </p>
        )}
      </GlassPanel>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'positive' | 'negative' | 'neutral'
}) {
  const color =
    tone === 'positive' ? 'var(--bn-positive)'
      : tone === 'negative' ? 'var(--bn-negative)'
        : 'var(--bn-text-primary)'
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: 'var(--bn-glass)',
        border: '0.5px solid var(--bn-glass-border)',
      }}
    >
      <p className="text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--bn-text-tertiary)' }}>
        {label}
      </p>
      <p className="bn-mono mt-1 text-base font-medium" style={{ color }}>
        {value}
      </p>
    </div>
  )
}
