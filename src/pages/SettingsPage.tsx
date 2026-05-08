import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { XlsxImporter } from '@/components/XlsxImporter'
import { DataMaintenanceCard } from '@/components/DataMaintenanceCard'
import { ExportButton } from '@/components/finance/ExportButton'
import { CurrencySettings } from '@/components/finance/CurrencySettings'
import { recomputeAllExchangeRates } from '@/lib/recompute-rates'
import { useExpenseHighlight, useFontScale, useWelcomeCooldownHours, type FontScale } from '@/lib/preferences'
import {
  importLegacyJson,
  listLegacyBackups,
  type ImportReport,
} from '@/lib/migrate-legacy'
import { db } from '@/db'

type SettingsTab = 'appearance' | 'currency' | 'data' | 'maintenance'

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('appearance')

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

      {/* Tab 选择 */}
      <div className="flex flex-wrap gap-1 rounded-full p-0.5"
        style={{
          background: 'var(--bn-glass)',
          border: '0.5px solid var(--bn-glass-border)',
          width: 'fit-content',
        }}>
        {([
          { key: 'appearance' as const, label: '外观' },
          { key: 'currency' as const, label: '货币' },
          { key: 'data' as const, label: '数据' },
          { key: 'maintenance' as const, label: '维护' },
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

      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'currency' && <CurrencyTab />}
      {tab === 'data' && <DataTab />}
      {tab === 'maintenance' && <MaintenanceTab />}
    </div>
  )
}

function AppearanceTab() {
  const [expenseHighlight, setExpenseHighlight] = useExpenseHighlight()
  const [fontScale, setFontScale] = useFontScale()
  const [welcomeCooldown, setWelcomeCooldown] = useWelcomeCooldownHours()

  return (
    <div className="space-y-5">
      <GlassPanel padding="lg" radius="lg" variant="strong">
        <h2 className="mb-1 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          外观主题
        </h2>
        <p className="mb-4 text-xs" style={{ color: 'var(--bn-text-secondary)' }}>
          选一个心情,随时换。点开"跟随系统"则白天暖桃、夜晚震金自动切换。
        </p>
        <ThemeSwitcher />
      </GlassPanel>

      {/* ── 字体大小 ─────────────────────────────────── */}
      <GlassPanel padding="lg" radius="lg" variant="default">
        <div
          style={{
            fontSize: 'var(--bn-text-md)',
            fontWeight: 500,
            color: 'var(--bn-text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          字体大小
        </div>
        <p
          style={{
            marginTop: 2,
            fontSize: 'var(--bn-text-sm)',
            color: 'var(--bn-text-tertiary)',
            letterSpacing: '-0.005em',
            lineHeight: 1.5,
          }}
        >
          全局字体档位,影响所有页面的文字、数字和标题。立即生效。
        </p>
        <div className="mt-3 flex gap-2">
          {(['small', 'medium', 'large'] as const).map((scale) => {
            const active = fontScale === scale
            const label = scale === 'small' ? '小' : scale === 'medium' ? '默认' : '大'
            const previewSize = scale === 'small' ? 13 : scale === 'medium' ? 15 : 17
            return (
              <button
                key={scale}
                type="button"
                onClick={() => setFontScale(scale)}
                className="flex-1 rounded-xl px-3 py-3 transition-all"
                style={{
                  background: active ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                  border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
                  color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-secondary)',
                }}
              >
                <div style={{ fontSize: previewSize, fontWeight: 500, lineHeight: 1.2 }}>
                  Aa
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--bn-text-tertiary)',
                    marginTop: 4,
                  }}
                >
                  {label}
                </div>
              </button>
            )
          })}
        </div>
      </GlassPanel>

      {/* ── 欢迎页冷却时间 ──────────────────────────── */}
      <GlassPanel padding="lg" radius="lg" variant="default">
        <div
          style={{
            fontSize: 'var(--bn-text-md)',
            fontWeight: 500,
            color: 'var(--bn-text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          启动欢迎页
        </div>
        <p
          style={{
            marginTop: 2,
            fontSize: 'var(--bn-text-sm)',
            color: 'var(--bn-text-tertiary)',
            letterSpacing: '-0.005em',
            lineHeight: 1.5,
          }}
        >
          每隔多久看一次"早上好鸭~"的欢迎页。距上次访问超过这个时间才会再弹。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {([
            { v: 1, label: '1 小时' },
            { v: 6, label: '6 小时' },
            { v: 24, label: '每天一次' },
            { v: 0, label: '关闭' },
          ] as const).map(({ v, label }) => {
            const active = welcomeCooldown === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => setWelcomeCooldown(v)}
                className="rounded-full px-3 py-1.5 transition-all"
                style={{
                  fontSize: 'var(--bn-text-sm)',
                  background: active ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                  color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-secondary)',
                  border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
                  fontWeight: active ? 500 : 400,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.removeItem('banya_welcome_last_seen')
              window.location.reload()
            } catch {
              /* ignore */
            }
          }}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors hover:bg-white/5"
          style={{
            fontSize: 'var(--bn-text-xs)',
            color: 'var(--bn-text-tertiary)',
          }}
        >
          ↻ 刷新页面立刻重看一次
        </button>
      </GlassPanel>

      <GlassPanel padding="lg" radius="lg" variant="default">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={expenseHighlight}
            onChange={(e) => setExpenseHighlight(e.target.checked)}
            className="mt-0.5 shrink-0"
            style={{ accentColor: 'var(--bn-negative)' }}
          />
          <div className="min-w-0 flex-1">
            <div
              style={{
                fontSize: 'var(--bn-text-md)',
                fontWeight: 500,
                color: 'var(--bn-text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              一键支出高亮
            </div>
            <p
              style={{
                marginTop: 2,
                fontSize: 'var(--bn-text-sm)',
                color: 'var(--bn-text-tertiary)',
                letterSpacing: '-0.005em',
                lineHeight: 1.5,
              }}
            >
              开启后,所有支出金额变红色 — 适合需要警觉花钱的时候。关闭则用主文字色,日常记账更舒服。
            </p>
            {/* 实时预览 */}
            <div
              className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2"
              style={{
                background: 'var(--bn-glass)',
                border: '0.5px solid var(--bn-glass-border)',
              }}
            >
              <span
                style={{ fontSize: 'var(--bn-text-sm)', color: 'var(--bn-text-tertiary)' }}
              >
                示例:
              </span>
              <span
                className="bn-mono"
                style={{
                  fontSize: 'var(--bn-text-md)',
                  fontWeight: 600,
                  color: expenseHighlight ? 'var(--bn-negative)' : 'var(--bn-text-primary)',
                }}
              >
                −€ 13.45
              </span>
              <span
                className="bn-mono"
                style={{
                  marginLeft: 'auto',
                  fontSize: 'var(--bn-text-md)',
                  fontWeight: 600,
                  color: 'var(--bn-positive)',
                }}
              >
                +€ 1,850.00
              </span>
            </div>
          </div>
        </label>
      </GlassPanel>
    </div>
  )
}

function CurrencyTab() {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  async function recompute() {
    if (!confirm('用当前汇率重算所有历史交易的折算汇率?\n这会影响月度统计 — 但能修复早期 Excel 导入时的固定 1:1 错误。')) return
    setBusy(true)
    try {
      const r = await recomputeAllExchangeRates()
      setFeedback(`✓ 已重算 ${r.updated} 条,跳过 ${r.skipped} 条`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <CurrencySettings />

      <GlassPanel padding="lg" radius="lg">
        <h2 className="mb-1 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          重算历史汇率
        </h2>
        <p className="mb-4 text-xs leading-relaxed"
          style={{ color: 'var(--bn-text-secondary)' }}>
          如果你在 Phase 5b 之前导入过 Excel,那些非欧元的交易折算汇率被错误地固定为 1:1。
          点这个按钮会用上面的当前汇率重新计算,修复结余/分析数字。
        </p>
        <Button onClick={recompute} disabled={busy}>
          {busy ? '处理中…' : '用当前汇率重算所有交易'}
        </Button>
        {feedback && (
          <p className="mt-3 text-xs" style={{ color: 'var(--bn-positive)' }}>
            {feedback}
          </p>
        )}
      </GlassPanel>
    </div>
  )
}

function DataTab() {
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)

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

  const backups = listLegacyBackups()

  return (
    <div className="space-y-5">
      <div id="xlsx-import">
        <XlsxImporter />
      </div>

      <GlassPanel padding="lg" radius="lg">
        <h2 className="mb-1 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          一键导出 Excel
        </h2>
        <p className="mb-3 text-xs leading-relaxed"
          style={{ color: 'var(--bn-text-secondary)' }}>
          8 张工作表:原始流水 + 周/月/品类/商家汇总 + 购物清单 + 库存。
          金额是 number、日期是 Excel date,可直接做透视表。
        </p>
        <ExportButton />
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
              style={{ color: report.success ? 'var(--bn-positive)' : 'var(--bn-negative)' }}
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

      {backups.length > 0 && (
        <GlassPanel padding="lg" radius="lg">
          <h2 className="mb-3 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
            已保存的老数据备份
          </h2>
          <ul className="bn-mono space-y-1 text-xs" style={{ color: 'var(--bn-text-secondary)' }}>
            {backups.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </GlassPanel>
      )}
    </div>
  )
}

function MaintenanceTab() {
  async function handleClear() {
    if (!confirm('确定要清空所有本地数据吗?此操作不可撤销。')) return
    await Promise.all(db.tables.map((t) => t.clear()))
    location.reload()
  }

  return (
    <div className="space-y-5">
      <DataMaintenanceCard />

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
