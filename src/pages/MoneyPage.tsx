import { useState } from 'react'
import { FinancePage } from '@/pages/FinancePage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'

type Tab = 'finance' | 'analytics'

export function MoneyPage() {
  const [tab, setTab] = useState<Tab>('finance')

  return (
    <div className="space-y-5">
      {/* 顶部 tab 切换 */}
      <div className="flex gap-1 rounded-full p-0.5"
        style={{
          background: 'var(--bn-glass)',
          border: '0.5px solid var(--bn-glass-border)',
          width: 'fit-content',
        }}>
        {([
          { key: 'finance' as const, label: '记账' },
          { key: 'analytics' as const, label: '分析' },
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

      {tab === 'finance' ? <FinancePage /> : <AnalyticsPage />}
    </div>
  )
}
