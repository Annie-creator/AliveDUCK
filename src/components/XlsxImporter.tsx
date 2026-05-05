import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import {
  clearAllFinanceData,
  commitXlsxImport,
  parseXlsxToFinance,
  type XlsxImportPreview,
} from '@/lib/migrate-xlsx'

const COLUMN_LABELS: Record<string, string> = {
  year: '年',
  month: '月',
  day: '日',
  date: '日期(整列)',
  type: '收支类型',
  category: '类别 / 商家',
  detail: '明细',
  amount: '金额',
  currency: '币种',
  location: '地点',
}

export function XlsxImporter() {
  const [preview, setPreview] = useState<XlsxImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [committed, setCommitted] = useState<number | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [showAllWarnings, setShowAllWarnings] = useState(false)

  async function handleFile(file: File | null) {
    if (!file) return
    setBusy(true)
    setCommitted(null)
    try {
      const result = await parseXlsxToFinance(file)
      setPreview(result)
      setFilename(file.name)
    } catch (e) {
      setPreview({
        transactions: [],
        skippedRows: 0,
        warnings: [(e as Error).message],
        columnMap: {},
        headerRow: 0,
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleCommit() {
    if (!preview || preview.transactions.length === 0) return
    setBusy(true)
    try {
      const count = await commitXlsxImport(preview.transactions)
      setCommitted(count)
      setPreview(null)
      setFilename(null)
    } finally {
      setBusy(false)
    }
  }

  async function handleClearAll() {
    if (
      !confirm(
        '会清空所有本地记账数据(含手动添加的)。如果想重新导入,先点这个再上传。继续吗?',
      )
    ) {
      return
    }
    const cleared = await clearAllFinanceData()
    alert(`已清空 ${cleared} 条记账数据`)
  }

  const totalAmount = preview
    ? preview.transactions.reduce(
        (sum, t) => sum + (t.type === 'expense' ? t.amount : 0),
        0,
      )
    : 0

  const dateRange = preview && preview.transactions.length > 0
    ? {
        from: new Date(
          Math.min(
            ...preview.transactions.map((t) => Date.parse(t.occurred_at)),
          ),
        ),
        to: new Date(
          Math.max(
            ...preview.transactions.map((t) => Date.parse(t.occurred_at)),
          ),
        ),
      }
    : null

  return (
    <GlassPanel padding="lg" radius="lg">
      <h2 className="mb-1 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
        从 Excel 导入账本
      </h2>
      <p
        className="mb-3 text-xs leading-relaxed"
        style={{ color: 'var(--bn-text-secondary)' }}
      >
        自动识别表头(中英都支持)。支持的列:
        <span className="bn-mono ml-1">年 月 日</span> 或 <span className="bn-mono">日期</span>{' '}
        · <span className="bn-mono">支出/收入</span> · <span className="bn-mono">类别</span> ·{' '}
        <span className="bn-mono">明细</span> · <span className="bn-mono">金额</span> ·{' '}
        <span className="bn-mono">单位</span> · <span className="bn-mono">地点</span>
      </p>

      <input
        type="file"
        accept=".xlsx,.xls"
        disabled={busy}
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        className="text-sm"
        style={{ color: 'var(--bn-text-secondary)' }}
      />

      {filename && (
        <p className="mt-2 text-xs" style={{ color: 'var(--bn-text-tertiary)' }}>
          已选择:<span className="bn-mono">{filename}</span>
        </p>
      )}

      {preview && (
        <div className="mt-4 space-y-3">
          {/* 列映射确认 */}
          <div
            className="rounded-xl p-3 text-xs"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
            }}
          >
            <p
              className="mb-2 font-medium"
              style={{ color: 'var(--bn-text-primary)' }}
            >
              列识别结果(表头在第 {preview.headerRow} 行)
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(preview.columnMap).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span style={{ color: 'var(--bn-text-secondary)' }}>
                    {COLUMN_LABELS[k] ?? k}
                  </span>
                  <span className="bn-mono" style={{ color: 'var(--bn-text-tertiary)' }}>
                    第 {(v as number) + 1} 列
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 总览 */}
          {preview.transactions.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="可导入" value={`${preview.transactions.length} 条`} />
              <Stat
                label="时间范围"
                value={
                  dateRange
                    ? `${dateRange.from.toLocaleDateString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                      })} — ${dateRange.to.toLocaleDateString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                      })}`
                    : '—'
                }
              />
              <Stat label="支出合计" value={`€ ${totalAmount.toFixed(2)}`} />
            </div>
          )}

          {/* 前 5 条预览 */}
          {preview.transactions.length > 0 && (
            <div>
              <p
                className="mb-2 text-xs font-medium"
                style={{ color: 'var(--bn-text-secondary)' }}
              >
                前 5 条预览
              </p>
              <div
                className="rounded-xl text-xs"
                style={{
                  background: 'var(--bn-glass)',
                  border: '0.5px solid var(--bn-glass-border)',
                }}
              >
                {preview.transactions.slice(0, 5).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-baseline gap-2 px-3 py-2"
                    style={{ borderBottom: '0.5px solid var(--bn-row-border)' }}
                  >
                    <span
                      className="bn-mono w-20 shrink-0"
                      style={{ color: 'var(--bn-text-tertiary)' }}
                    >
                      {t.occurred_at.slice(0, 10)}
                    </span>
                    <span
                      className="w-24 shrink-0 truncate"
                      style={{ color: 'var(--bn-text-primary)' }}
                    >
                      {t.participant || '—'}
                    </span>
                    <span
                      className="flex-1 truncate"
                      style={{ color: 'var(--bn-text-secondary)' }}
                    >
                      {t.note || '—'}
                    </span>
                    <span
                      className="bn-mono shrink-0"
                      style={{
                        color:
                          t.type === 'income'
                            ? 'var(--bn-positive)'
                            : 'var(--bn-text-primary)',
                      }}
                    >
                      {t.type === 'income' ? '+' : '−'}
                      {t.amount.toFixed(2)} {t.currency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 警告 */}
          {preview.warnings.length > 0 && (
            <div
              className="rounded-xl p-3 text-xs"
              style={{
                background: 'var(--bn-glass)',
                border: '0.5px solid var(--bn-glass-border)',
              }}
            >
              <p
                className="mb-1.5 font-medium"
                style={{ color: 'var(--bn-negative)' }}
              >
                {preview.warnings.length} 条警告 · 跳过 {preview.skippedRows} 行
              </p>
              <ul className="space-y-0.5" style={{ color: 'var(--bn-text-secondary)' }}>
                {(showAllWarnings
                  ? preview.warnings
                  : preview.warnings.slice(0, 5)
                ).map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
              {preview.warnings.length > 5 && (
                <button
                  type="button"
                  className="mt-2 text-xs underline"
                  style={{ color: 'var(--bn-text-tertiary)' }}
                  onClick={() => setShowAllWarnings(!showAllWarnings)}
                >
                  {showAllWarnings ? '收起' : `展开全部 ${preview.warnings.length} 条`}
                </button>
              )}
            </div>
          )}

          {/* 提交 */}
          {preview.transactions.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={handleCommit} disabled={busy}>
                {busy ? '导入中…' : `确认导入 ${preview.transactions.length} 条`}
              </Button>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                取消
              </Button>
            </div>
          )}
        </div>
      )}

      {committed !== null && (
        <p
          className="mt-3 text-sm font-medium"
          style={{ color: 'var(--bn-positive)' }}
        >
          ✓ 已导入 {committed} 条流水。去记账页看看 →
        </p>
      )}

      <div
        className="mt-5 border-t pt-4"
        style={{ borderColor: 'var(--bn-row-border)' }}
      >
        <p
          className="mb-2 text-xs"
          style={{ color: 'var(--bn-text-tertiary)' }}
        >
          想重新导入?先清空当前记账数据再上传。
        </p>
        <Button variant="ghost" size="sm" onClick={handleClearAll}>
          清空所有记账数据
        </Button>
      </div>
    </GlassPanel>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl p-2.5"
      style={{
        background: 'var(--bn-glass)',
        border: '0.5px solid var(--bn-glass-border)',
      }}
    >
      <p
        className="text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--bn-text-tertiary)' }}
      >
        {label}
      </p>
      <p
        className="bn-mono mt-0.5 text-sm font-medium"
        style={{ color: 'var(--bn-text-primary)' }}
      >
        {value}
      </p>
    </div>
  )
}
