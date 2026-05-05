import { useEffect } from 'react'
import { XlsxImporter } from '@/components/XlsxImporter'

interface Props {
  onClose: () => void
}

/**
 * Excel 导入对话框。把已有的 XlsxImporter 卡片包在模态壳里,
 * 让它能在记账页右上角"导入"按钮直接弹出,而不必跳设置页。
 */
export function XlsxImporterModal({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-2xl rounded-2xl p-5"
        style={{
          background: 'var(--bn-bg)',
          border: '0.5px solid var(--bn-glass-border)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
            从 Excel 导入账本
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm"
            style={{ color: 'var(--bn-text-tertiary)' }}
          >
            ✕
          </button>
        </div>
        <XlsxImporter />
      </div>
    </div>
  )
}
