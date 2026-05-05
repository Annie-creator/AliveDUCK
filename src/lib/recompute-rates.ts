/**
 * 重新计算所有已有流水的 exchange_rate。
 *
 * 当用户:
 * - 早期版本导入 Excel 时 exchange_rate 被错误固定为 1
 * - 修改了汇率后想让历史数据反映新汇率
 *
 * 这个工具按"当前汇率"重新写入每条流水的 exchange_rate。
 * 注意:这会改变历史月度统计 —— 是一次性数据修复,不是日常操作。
 */

import { db } from '@/db'
import { financeRepo } from '@/repositories'
import { rateToBase, getRates, getBaseCurrency } from './currency'

export async function recomputeAllExchangeRates(): Promise<{
  updated: number
  skipped: number
}> {
  const baseCurrency = await getBaseCurrency()
  const rates = await getRates()

  const all = await db.finance_transactions.toArray()
  let updated = 0
  let skipped = 0

  for (const t of all) {
    if (t.deleted_at) {
      skipped++
      continue
    }
    const newRate = rateToBase(t.currency, baseCurrency, rates)
    if (Math.abs((t.exchange_rate ?? 1) - newRate) < 1e-6) {
      skipped++
      continue
    }
    await financeRepo.update(t.id, { exchange_rate: newRate })
    updated++
  }

  return { updated, skipped }
}
