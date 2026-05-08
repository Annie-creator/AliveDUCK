import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, Download, Filter } from 'lucide-react'
import { db } from '@/db'
import { Button } from '@/components/ui/Button'
import { exportFinanceToXlsx } from '@/lib/excel-export'

/**
 * 导出按钮 + 选项面板。
 *
 * Phase D-4 增强：支持排除分类（如住宿）—— 因为住宿单笔太大,会把所有
 * data bar 都顶满,导致日常花销之间区分不开。Annie 可以勾掉它再导出。
 */
export function ExportButton({
  variant = 'glass',
}: {
  variant?: 'glass' | 'primary' | 'ghost'
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  // 仅列出有过支出的分类（避免列一堆从没用过的）
  const categories = useLiveQuery(
    () => db.categories.filter((c) => !c.deleted_at).toArray(),
    [],
    [],
  )
  const transactions = useLiveQuery(
    () =>
      db.finance_transactions
        .filter((t) => !t.deleted_at && t.type === 'expense')
        .toArray(),
    [],
    [],
  )

  const usedExpenseCats = useMemo(() => {
    const ids = new Set<string>()
    for (const t of transactions ?? []) {
      if (t.category_id) ids.add(t.category_id)
    }
    return (categories ?? [])
      .filter((c) => ids.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [categories, transactions])

  function toggleCat(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function doExport() {
    setBusy(true)
    try {
      await exportFinanceToXlsx({ excludeCategoryIds: Array.from(excluded) })
      setOpen(false)
    } catch (e) {
      alert(`导出失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // 智能预设：包含"住宿"关键词的分类一键勾掉
  function presetExcludeLodging() {
    const ids = usedExpenseCats
      .filter((c) => /住宿|房租|酒店|宿舍|公寓|租金/.test(c.name))
      .map((c) => c.id)
    setExcluded(new Set(ids))
  }

  return (
    <div className="relative inline-block">
      <Button variant={variant} onClick={() => setOpen((v) => !v)} disabled={busy}>
        {busy ? (
          '生成中…'
        ) : (
          <>
            <Download size={13} strokeWidth={2} style={{ marginRight: 4, verticalAlign: -1 }} />
            导出 Excel
            <ChevronDown
              size={11}
              strokeWidth={2}
              style={{
                marginLeft: 4,
                verticalAlign: 0,
                transform: open ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.2s',
              }}
            />
          </>
        )}
      </Button>

      {open && (
        <>
          {/* 点空白处关闭 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          <div
            className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl"
            style={{
              background: 'var(--bn-bg)',
              border: '0.5px solid var(--bn-glass-border)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-baseline justify-between px-4 pb-2 pt-3"
              style={{ borderBottom: '0.5px solid var(--bn-row-border)' }}
            >
              <span
                style={{
                  fontSize: 'var(--bn-text-md)',
                  fontWeight: 600,
                  color: 'var(--bn-text-primary)',
                  letterSpacing: '-0.01em',
                }}
              >
                导出选项
              </span>
              <button
                type="button"
                onClick={presetExcludeLodging}
                className="rounded-md px-2 py-0.5 transition-colors hover:bg-white/5"
                style={{
                  fontSize: 'var(--bn-text-xs)',
                  color: 'var(--bn-accent)',
                  fontWeight: 500,
                }}
                title="一键勾选所有「住宿/房租」类分类排除"
              >
                <Filter size={10} strokeWidth={2} style={{ display: 'inline-block', verticalAlign: -1, marginRight: 2 }} />
                一键剔除住宿
              </button>
            </div>

            <div className="px-4 pb-1 pt-3">
              <p
                className="mb-1.5"
                style={{
                  fontSize: 'var(--bn-text-xs)',
                  color: 'var(--bn-text-tertiary)',
                  lineHeight: 1.5,
                }}
              >
                勾选要 <strong style={{ color: 'var(--bn-text-secondary)' }}>排除</strong> 的分类。导出后这些分类的支出不进汇总,data bar 会更好看。
              </p>
            </div>

            <div className="max-h-72 overflow-y-auto px-2 pb-2">
              {usedExpenseCats.length === 0 ? (
                <p
                  className="py-4 text-center"
                  style={{ fontSize: 'var(--bn-text-sm)', color: 'var(--bn-text-tertiary)' }}
                >
                  暂无支出分类
                </p>
              ) : (
                usedExpenseCats.map((c) => {
                  const isExcluded = excluded.has(c.id)
                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5"
                    >
                      <input
                        type="checkbox"
                        checked={isExcluded}
                        onChange={() => toggleCat(c.id)}
                        style={{ accentColor: 'var(--bn-negative)' }}
                      />
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: c.color || 'var(--bn-text-tertiary)',
                        }}
                      />
                      <span
                        className="flex-1 truncate"
                        style={{
                          fontSize: 'var(--bn-text-sm)',
                          color: 'var(--bn-text-primary)',
                          textDecoration: isExcluded ? 'line-through' : 'none',
                          opacity: isExcluded ? 0.55 : 1,
                        }}
                      >
                        {c.name}
                      </span>
                    </label>
                  )
                })
              )}
            </div>

            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderTop: '0.5px solid var(--bn-row-border)' }}
            >
              <span
                style={{
                  fontSize: 'var(--bn-text-xs)',
                  color: 'var(--bn-text-tertiary)',
                  marginRight: 'auto',
                }}
              >
                {excluded.size > 0 ? `已排除 ${excluded.size} 个` : '全部包含'}
              </span>
              {excluded.size > 0 && (
                <Button variant="ghost" onClick={() => setExcluded(new Set())}>
                  清空
                </Button>
              )}
              <Button onClick={() => void doExport()} disabled={busy}>
                {busy ? '生成中…' : '开始导出'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
