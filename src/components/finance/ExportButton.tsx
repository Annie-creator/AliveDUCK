import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { exportFinanceToXlsx } from '@/lib/excel-export'

export function ExportButton({ variant = 'glass' }: { variant?: 'glass' | 'primary' | 'ghost' }) {
  const [busy, setBusy] = useState(false)

  async function handleExport() {
    setBusy(true)
    try {
      await exportFinanceToXlsx()
    } catch (e) {
      alert(`导出失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant={variant} onClick={handleExport} disabled={busy}>
      {busy ? '生成中…' : '导出为 Excel'}
    </Button>
  )
}
