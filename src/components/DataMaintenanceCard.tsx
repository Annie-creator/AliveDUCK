import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import {
  countDuplicateCategories,
  dedupCategories,
  type DedupReport,
} from '@/lib/dedup-categories'
import {
  countDuplicateSettings,
  dedupSettings,
  type SettingsDedupReport,
} from '@/lib/dedup-settings'
import {
  countDuplicateFinance,
  dedupFinance,
  type FinanceDedupReport,
} from '@/lib/dedup-finance'

/**
 * 数据维护卡片(2026-05 三合一版)。
 *
 * 启动时同时检测三类历史脏数据:
 *   1. settings 重复(阻断同步,优先级最高)
 *   2. 流水重复(同一份 Excel 反复导入造成)
 *   3. 分类重复(早期 race condition 留下的)
 *
 * 没重复完全不显示。
 */
export function DataMaintenanceCard() {
  const [catDups, setCatDups] = useState<number | null>(null)
  const [settingDups, setSettingDups] = useState<number | null>(null)
  const [finDups, setFinDups] = useState<number | null>(null)

  const [busyKind, setBusyKind] = useState<'cat' | 'setting' | 'fin' | null>(null)
  const [catReport, setCatReport] = useState<DedupReport | null>(null)
  const [settingReport, setSettingReport] = useState<SettingsDedupReport | null>(null)
  const [finReport, setFinReport] = useState<FinanceDedupReport | null>(null)

  async function refreshCounts() {
    setCatDups(await countDuplicateCategories())
    setSettingDups(await countDuplicateSettings())
    setFinDups(await countDuplicateFinance())
  }

  useEffect(() => {
    void refreshCounts()
  }, [])

  async function handleDedupCats() {
    if (
      !confirm('将合并所有同名分类(保留最早创建的那个),并把流水/预算重新指向。继续?')
    )
      return
    setBusyKind('cat')
    try {
      const r = await dedupCategories()
      setCatReport(r)
      await refreshCounts()
    } finally {
      setBusyKind(null)
    }
  }

  async function handleDedupSettings() {
    if (
      !confirm(
        '将合并所有 (user_id, key) 重复的 settings 行(保留同步过的或最早创建的),其余软删。修复同步失败的常见原因。继续?',
      )
    )
      return
    setBusyKind('setting')
    try {
      const r = await dedupSettings()
      setSettingReport(r)
      await refreshCounts()
    } finally {
      setBusyKind(null)
    }
  }

  async function handleDedupFinance() {
    if (
      !confirm(
        '将按 (日期+金额+商家+备注) 合并完全相同的流水。同一笔的多个副本会被软删,只保留一条。这种重复一般来自重复导入 Excel。继续?',
      )
    )
      return
    setBusyKind('fin')
    try {
      const r = await dedupFinance()
      setFinReport(r)
      await refreshCounts()
    } finally {
      setBusyKind(null)
    }
  }

  if (catDups === null || settingDups === null || finDups === null) return null
  if (
    catDups === 0 &&
    settingDups === 0 &&
    finDups === 0 &&
    !catReport &&
    !settingReport &&
    !finReport
  )
    return null

  const hasIssue = catDups > 0 || settingDups > 0 || finDups > 0

  return (
    <GlassPanel
      padding="lg"
      radius="lg"
      style={{
        borderLeft: hasIssue ? `3px solid var(--bn-negative)` : undefined,
      }}
    >
      <h2 className="mb-1 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
        数据维护
      </h2>

      {/* —— 1) Settings 重复(优先级最高,阻断同步) —— */}
      {settingDups > 0 && (
        <Block hasFollowing={catDups > 0 || finDups > 0 || !!catReport || !!finReport}>
          <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--bn-text-secondary)' }}>
            检测到{' '}
            <span className="bn-mono" style={{ color: 'var(--bn-negative)' }}>
              {settingDups}
            </span>{' '}
            条重复 settings —— 这会让<strong style={{ color: 'var(--bn-text-primary)' }}>同步一直失败</strong>。先点这个,通了之后再处理别的。
          </p>
          <Button onClick={handleDedupSettings} disabled={busyKind !== null}>
            {busyKind === 'setting' ? '清理中…' : `合并 ${settingDups} 条重复 settings`}
          </Button>
        </Block>
      )}

      {settingReport && (
        <Report tone="positive" title="✓ Settings 已清理">
          <li>· 合并了 {settingReport.groupsFound} 组(共 {settingReport.duplicatesRemoved} 条软删)</li>
          {settingReport.affectedKeys.length > 0 && (
            <li>
              · 涉及 key:
              <span className="bn-mono ml-1">
                {settingReport.affectedKeys.slice(0, 6).join(', ')}
                {settingReport.affectedKeys.length > 6 ? ' …' : ''}
              </span>
            </li>
          )}
        </Report>
      )}

      {/* —— 2) 流水重复(导入造成的脏数据) —— */}
      {finDups > 0 && (
        <Block hasFollowing={catDups > 0 || !!catReport}>
          <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--bn-text-secondary)' }}>
            检测到{' '}
            <span className="bn-mono" style={{ color: 'var(--bn-negative)' }}>
              {finDups}
            </span>{' '}
            条重复流水(同一笔被导入多次)。按 <span className="bn-mono">日期+金额+商家+备注</span> 判重,每组保留 1 条,其余软删。
          </p>
          <Button onClick={handleDedupFinance} disabled={busyKind !== null}>
            {busyKind === 'fin' ? '清理中…' : `合并 ${finDups} 条重复流水`}
          </Button>
        </Block>
      )}

      {finReport && (
        <Report tone="positive" title="✓ 流水已清理">
          <li>· 合并了 {finReport.groupsFound} 组(共 {finReport.duplicatesRemoved} 条软删)</li>
          {finReport.affectedSamples.length > 0 && (
            <>
              <li>· 样本:</li>
              {finReport.affectedSamples.map((s, i) => (
                <li key={i} className="bn-mono pl-3" style={{ fontSize: 10 }}>
                  · {s}
                </li>
              ))}
            </>
          )}
        </Report>
      )}

      {/* —— 3) 分类重复 —— */}
      {catDups > 0 && (
        <Block>
          <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--bn-text-secondary)' }}>
            检测到{' '}
            <span className="bn-mono" style={{ color: 'var(--bn-negative)' }}>
              {catDups}
            </span>{' '}
            条重复分类。早期 race condition 留下的,合并后流水会自动重新指向,不丢任何数据。
          </p>
          <Button onClick={handleDedupCats} disabled={busyKind !== null}>
            {busyKind === 'cat' ? '清理中…' : `合并 ${catDups} 条重复分类`}
          </Button>
        </Block>
      )}

      {catReport && (
        <Report tone="positive" title="✓ 分类已清理">
          <li>· 合并了 {catReport.groupsFound} 组(共 {catReport.duplicatesRemoved} 条软删)</li>
          <li>· {catReport.transactionsRepointed} 条流水重新指向</li>
          <li>· {catReport.budgetsRepointed} 条预算重新指向</li>
        </Report>
      )}
    </GlassPanel>
  )
}

function Block({
  children,
  hasFollowing,
}: {
  children: React.ReactNode
  hasFollowing?: boolean
}) {
  return <div className={hasFollowing ? 'mb-4' : ''}>{children}</div>
}

function Report({
  title,
  tone,
  children,
}: {
  title: string
  tone: 'positive' | 'neutral'
  children: React.ReactNode
}) {
  return (
    <div
      className="mt-3 rounded-xl p-3 text-xs"
      style={{
        background: 'var(--bn-glass)',
        border: '0.5px solid var(--bn-glass-border)',
      }}
    >
      <p
        className="mb-1 font-medium"
        style={{ color: tone === 'positive' ? 'var(--bn-positive)' : 'var(--bn-text-primary)' }}
      >
        {title}
      </p>
      <ul className="space-y-0.5" style={{ color: 'var(--bn-text-secondary)' }}>
        {children}
      </ul>
    </div>
  )
}
