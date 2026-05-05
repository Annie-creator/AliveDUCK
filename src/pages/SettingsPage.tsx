import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { XlsxImporter } from '@/components/XlsxImporter'
import { DataMaintenanceCard } from '@/components/DataMaintenanceCard'
import { ExportButton } from '@/components/finance/ExportButton'
import { CurrencySettings } from '@/components/finance/CurrencySettings'
import { AuthPanel } from '@/auth/AuthPanel'
import {
  importLegacyJson,
  listLegacyBackups,
  type ImportReport,
} from '@/lib/migrate-legacy'
import { db } from '@/db'

export function SettingsPage() {
  const [report, setReport] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      const merged: Record<string, unknown> = {}
      for (const f of Array.from(files)) {
        const text = await f.text()
        try {
          const parsed = JSON.parse(text)
          if (Array.isArray(parsed)) {
            merged.journals = [...((merged.journals as unknown[]) ?? []), ...parsed]
          } else if (parsed && typeof parsed === 'object') {
            Object.assign(merged, parsed)
          }
        } catch (e) {
          console.error(`无法解析 ${f.name}:`, e)
        }
      }
      const r = await importLegacyJson(merged)
      setReport(r)
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    if (!confirm('确定要清空所有本地数据吗?此操作不可撤销。')) return
    await Promise.all(db.tables.map((t) => t.clear()))
    location.reload()
  }

  const backups = listLegacyBackups()

  return (
    <div className="space-y-5">
      <div>
        <p
          className="mb-1.5 text-[11px] font-medium tracking-[0.06em] uppercase"
          style={{ color: 'var(--bn-text-secondary)' }}
        >
          设置
        </p>
        <h1
          className="text-[30px] leading-[1.15]"
          style={{
            color: 'var(--bn-text-primary)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
          }}
        >
          调一调你的
          <span
            className="ml-2"
            style={{
              color: 'var(--bn-text-tertiary)',
              fontWeight: 300,
              letterSpacing: '-0.02em',
            }}
          >
            生存空间
          </span>
        </h1>
      </div>

      <DataMaintenanceCard />

      <AuthPanel />

      <CurrencySettings />

      <XlsxImporter />

      <GlassPanel padding="lg" radius="lg">
        <h2 className="mb-1 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          导出
        </h2>
        <p className="mb-3 text-xs leading-relaxed"
          style={{ color: 'var(--bn-text-secondary)' }}>
          一键生成 8 张工作表的 Excel:原始流水 + 周/月/品类/商家汇总 + 购物清单 + 库存。
          金额是 number、日期是 Excel date,可直接做透视表。
        </p>
        <ExportButton />
      </GlassPanel>

      <GlassPanel padding="lg" radius="lg" variant="strong">
        <h2 className="mb-1 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          外观主题
        </h2>
        <p className="mb-4 text-xs" style={{ color: 'var(--bn-text-secondary)' }}>
          选一个心情,随时换。点开"跟随系统"则白天暖桃、夜晚震金自动切换。
        </p>
        <ThemeSwitcher />
      </GlassPanel>

      <GlassPanel padding="lg" radius="lg">
        <h2 className="mb-1 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          从老版 JSON 导入
        </h2>
        <p className="mb-4 text-xs" style={{ color: 'var(--bn-text-secondary)' }}>
          支持同时选择 phd_core.json 和 phd_journals.json。导入前会自动备份原文件。
        </p>
        <input
          type="file"
          accept="application/json"
          multiple
          disabled={busy}
          onChange={(e) => handleFiles(e.target.files)}
          className="text-sm"
          style={{ color: 'var(--bn-text-secondary)' }}
        />
        {report && (
          <div className="mt-4 space-y-1 text-sm">
            <div
              style={{
                color: report.success ? 'var(--bn-positive)' : 'var(--bn-negative)',
              }}
            >
              {report.success ? '导入成功' : '部分导入'}
            </div>
            {Object.entries(report.counts).map(([k, v]) => (
              <div key={k} style={{ color: 'var(--bn-text-secondary)' }}>
                {k}: {v} 条
              </div>
            ))}
            {report.errors.map((e) => (
              <div key={e} style={{ color: 'var(--bn-negative)' }}>
                · {e}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      <GlassPanel padding="lg" radius="lg">
        <h2 className="mb-3 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          已保存的老数据备份
        </h2>
        {backups.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--bn-text-tertiary)' }}>
            暂无
          </p>
        ) : (
          <ul className="bn-mono space-y-1 text-xs" style={{ color: 'var(--bn-text-secondary)' }}>
            {backups.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
      </GlassPanel>

      <GlassPanel padding="lg" radius="lg">
        <h2 className="mb-1 text-base font-medium" style={{ color: 'var(--bn-negative)' }}>
          危险区
        </h2>
        <p className="mb-4 text-xs" style={{ color: 'var(--bn-text-secondary)' }}>
          清空浏览器内全部数据(IndexedDB)。备份不会被删,可重新导入。
        </p>
        <Button variant="danger" onClick={handleClear}>
          清空本地数据
        </Button>
      </GlassPanel>
    </div>
  )
}
