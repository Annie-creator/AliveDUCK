import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import {
  countDuplicateCategories,
  dedupCategories,
  type DedupReport,
} from '@/lib/dedup-categories'

/**
 * 数据维护卡片。
 *
 * 启动时自动检测分类重复(早期版本的 race condition bug 留下的脏数据)。
 * 检测到就显示一个红色提示条 + 一键清理按钮。
 * 没有重复就完全不显示这个卡片。
 */
export function DataMaintenanceCard() {
  const [duplicates, setDuplicates] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<DedupReport | null>(null)

  useEffect(() => {
    void countDuplicateCategories().then(setDuplicates)
  }, [])

  async function handleDedup() {
    if (!confirm(
      '将合并所有同名分类(保留最早创建的那个),并把流水/预算重新指向。继续?',
    )) return
    setBusy(true)
    try {
      const r = await dedupCategories()
      setReport(r)
      // 清理后重新检测
      const remaining = await countDuplicateCategories()
      setDuplicates(remaining)
    } finally {
      setBusy(false)
    }
  }

  // 没有重复 + 没有刚清理过的报告 → 不显示
  if (duplicates === 0 && !report) return null
  if (duplicates === null) return null

  return (
    <GlassPanel
      padding="lg"
      radius="lg"
      style={{
        borderLeft: duplicates > 0 ? `3px solid var(--bn-negative)` : undefined,
      }}
    >
      <h2 className="mb-1 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
        数据维护
      </h2>

      {duplicates > 0 && (
        <>
          <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--bn-text-secondary)' }}>
            检测到 <span className="bn-mono" style={{ color: 'var(--bn-negative)' }}>
              {duplicates}
            </span> 条重复分类。这是早期版本的 bug(race condition)留下的脏数据,
            点击下方按钮一键清理。会保留最早的那条,流水会重新指向它,不丢任何数据。
          </p>
          <Button onClick={handleDedup} disabled={busy}>
            {busy ? '清理中…' : `合并 ${duplicates} 条重复`}
          </Button>
        </>
      )}

      {report && (
        <div
          className="mt-3 rounded-xl p-3 text-xs"
          style={{
            background: 'var(--bn-glass)',
            border: '0.5px solid var(--bn-glass-border)',
          }}
        >
          <p className="mb-1 font-medium" style={{ color: 'var(--bn-positive)' }}>
            ✓ 清理完成
          </p>
          <ul className="space-y-0.5" style={{ color: 'var(--bn-text-secondary)' }}>
            <li>· 合并了 {report.groupsFound} 组重复(共 {report.duplicatesRemoved} 条软删)</li>
            <li>· {report.transactionsRepointed} 条流水重新指向</li>
            <li>· {report.budgetsRepointed} 条预算重新指向</li>
          </ul>
        </div>
      )}
    </GlassPanel>
  )
}
