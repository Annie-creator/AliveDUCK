/**
 * 流水内容去重 —— 给「重复导入 Excel」造成的脏数据兜底。
 *
 * 触发场景:
 * 1. 用户在 guest 空窗期点了导入 → 登录 → 又点一次 → 反复 N 次 → 一份文件被导 N 份
 * 2. 不同设备各自导入了同一份 Excel(手机/电脑各点一次)
 * 3. 误触"确认导入"按钮多次
 *
 * importer 之前没做内容去重(commitXlsxImport 里写得很明白:"不去重"),
 * 所以一旦发生上面任何一种,本地就会堆出一堆 UUID 不同、但内容完全一样的行。
 * 推到云端后 (user_id, key) 没约束(流水不像 settings 有唯一约束),
 * 云端也乖乖收下,然后两端越来越多。
 *
 * 去重键:`occurred_at + amount + participant + note`
 *   - 不含 currency:同一笔不会同时存在 EUR 和 CNY 版本(currency 不变)
 *   - 不含 category_id:用户可能手动改了某些行的分类,但 key 不变
 *   - 不含 type:expense vs income 不会撞(amount 同 + occurred_at 同 + 商家备注同
 *     时,基本不可能同一秒既支出又收入同样的金额)
 *
 * keeper 选取(跟 dedup-categories 一致):
 *   1. sync_status='synced' 优先 —— 它的 id 已和云端绑定,留它推送时不会撞
 *   2. 同状态下 created_at 早的优先(可重入,稳定)
 */

import { db } from '@/db'
import { financeRepo } from '@/repositories'
import type { FinanceTransaction } from '@/types'

export interface FinanceDedupReport {
  groupsFound: number
  duplicatesRemoved: number
  /** 前几个被合并的样本,UI 给用户看一眼信任 */
  affectedSamples: string[]
}

export async function countDuplicateFinance(): Promise<number> {
  const rows = await db.finance_transactions.filter((t) => !t.deleted_at).toArray()
  const groups = groupByContent(rows)
  let extras = 0
  for (const arr of groups.values()) {
    if (arr.length > 1) extras += arr.length - 1
  }
  return extras
}

export async function dedupFinance(): Promise<FinanceDedupReport> {
  const rows = await db.finance_transactions.filter((t) => !t.deleted_at).toArray()
  const groups = groupByContent(rows)

  let groupsFound = 0
  let duplicatesRemoved = 0
  const samples: string[] = []

  for (const [, arr] of groups) {
    if (arr.length <= 1) continue
    groupsFound++

    arr.sort(compareForKeeper)
    const keeper = arr[0]!

    if (samples.length < 5) {
      const dt = new Date(keeper.occurred_at).toISOString().slice(0, 10)
      const part = keeper.participant?.trim() || '(无商家)'
      samples.push(
        `${dt} ${part} €${keeper.amount.toFixed(2)} ×${arr.length}`,
      )
    }

    for (let i = 1; i < arr.length; i++) {
      try {
        await financeRepo.softDelete(arr[i]!.id)
        duplicatesRemoved++
      } catch {
        // 已删等情况都吞掉,不打断
      }
    }
  }

  return { groupsFound, duplicatesRemoved, affectedSamples: samples }
}

function compareForKeeper(a: FinanceTransaction, b: FinanceTransaction): number {
  const aSynced = a.sync_status === 'synced'
  const bSynced = b.sync_status === 'synced'
  if (aSynced && !bSynced) return -1
  if (!aSynced && bSynced) return 1
  return a.created_at.localeCompare(b.created_at)
}

function groupByContent(
  rows: FinanceTransaction[],
): Map<string, FinanceTransaction[]> {
  const m = new Map<string, FinanceTransaction[]>()
  for (const r of rows) {
    // 注意:把 user_id 也放进 key,避免不同账号的相同内容互相合并
    const k = `${r.user_id}|${r.occurred_at}|${r.amount.toFixed(2)}|${(r.participant ?? '').trim()}|${(r.note ?? '').trim()}`
    const arr = m.get(k) ?? []
    arr.push(r)
    m.set(k, arr)
  }
  return m
}
