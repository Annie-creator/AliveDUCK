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

/**
 * 数据维护卡片。
 *
 * 启动时同时检测两类历史脏数据:
 *   1. 同名分类重复(早期 race condition 留下,首次 pull 与 ensureDefaults 撞 UUID)
 *   2. 同 (user_id, key) 的 settings 重复(setValue 不原子 + promoteGuestData 撞云端)
 *
 * 第 (2) 个会让 sync 一直推不上去 —— Supabase 那边 `(user_id, key)` 是唯一约束。
 *
 * 没重复就完全不显示这张卡片。
 */
export function DataMaintenanceCard() {
  const [catDups, setCatDups] = useState<number | null>(null)
  const [settingDups, setSettingDups] = useState<number | null>(null)
  const [busyKind, setBusyKind] = useState<'cat' | 'setting' | null>(null)
  const [catReport, setCatReport] = useState<DedupReport | null>(null)
  const [settingReport, setSettingReport] = useState<SettingsDedupReport | null>(null)

  useEffect(() => {
    void countDuplicateCategories().then(setCatDups)
    void countDuplicateSettings().then(setSettingDups)
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
      setCatDups(await countDuplicateCategories())
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
      setSettingDups(await countDuplicateSettings())
    } finally {
      setBusyKind(null)
    }
  }

  // 没有任何重复 + 没有任何已清理报告 → 卡片不显示
  if (catDups === null || settingDups === null) return null
  if (catDups === 0 && settingDups === 0 && !catReport && !settingReport) return null

  const hasIssue = catDups > 0 || settingDups > 0

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

      {/* —— Settings 重复(更优先,因为它阻断同步) —— */}
      {settingDups > 0 && (
        <div className={catDups > 0 || catReport ? 'mb-4' : ''}>
          <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--bn-text-secondary)' }}>
            检测到{' '}
            <span className="bn-mono" style={{ color: 'var(--bn-negative)' }}>
              {settingDups}
            </span>{' '}
            条重复 settings —— Supabase 上 (user_id, key) 有唯一约束,本地这堆重复会让
            <strong style={{ color: 'var(--bn-text-primary)' }}>同步一直失败</strong>
            。点下面合并,修完同步就通了。
          </p>
          <Button onClick={handleDedupSettings} disabled={busyKind !== null}>
            {busyKind === 'setting' ? '清理中…' : `合并 ${settingDups} 条重复 settings`}
          </Button>
        </div>
      )}

      {settingReport && (
        <div
          className={`rounded-xl p-3 text-xs ${settingDups > 0 || catDups > 0 || catReport ? 'mb-4' : 'mt-3'}`}
          style={{
            background: 'var(--bn-glass)',
            border: '0.5px solid var(--bn-glass-border)',
          }}
        >
          <p className="mb-1 font-medium" style={{ color: 'var(--bn-positive)' }}>
            ✓ Settings 已清理
          </p>
          <ul className="space-y-0.5" style={{ color: 'var(--bn-text-secondary)' }}>
            <li>
              · 合并了 {settingReport.groupsFound} 组重复(共 {settingReport.duplicatesRemoved} 条软删)
            </li>
            {settingReport.affectedKeys.length > 0 && (
              <li>
                · 涉及 key:
                <span className="bn-mono ml-1">
                  {settingReport.affectedKeys.slice(0, 6).join(', ')}
                  {settingReport.affectedKeys.length > 6 ? ' …' : ''}
                </span>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* —— Categories 重复 —— */}
      {catDups > 0 && (
        <div>
          <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--bn-text-secondary)' }}>
            检测到{' '}
            <span className="bn-mono" style={{ color: 'var(--bn-negative)' }}>
              {catDups}
            </span>{' '}
            条重复分类。早期版本 race condition 留下的脏数据,合并保留最早的那条,流水会重新指向它,不丢任何数据。
          </p>
          <Button onClick={handleDedupCats} disabled={busyKind !== null}>
            {busyKind === 'cat' ? '清理中…' : `合并 ${catDups} 条重复分类`}
          </Button>
        </div>
      )}

      {catReport && (
        <div
          className="mt-3 rounded-xl p-3 text-xs"
          style={{
            background: 'var(--bn-glass)',
            border: '0.5px solid var(--bn-glass-border)',
          }}
        >
          <p className="mb-1 font-medium" style={{ color: 'var(--bn-positive)' }}>
            ✓ 分类已清理
          </p>
          <ul className="space-y-0.5" style={{ color: 'var(--bn-text-secondary)' }}>
            <li>
              · 合并了 {catReport.groupsFound} 组重复(共 {catReport.duplicatesRemoved} 条软删)
            </li>
            <li>· {catReport.transactionsRepointed} 条流水重新指向</li>
            <li>· {catReport.budgetsRepointed} 条预算重新指向</li>
          </ul>
        </div>
      )}
    </GlassPanel>
  )
}
