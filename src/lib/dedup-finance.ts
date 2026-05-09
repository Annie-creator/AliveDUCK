/**
 * 流水内容去重(2026-05 根治版)。
 *
 * 升级:**判重键现在做 NFKC 归一化 + 空格折叠 + 小写**。
 *
 * 之前的版本用 `participant.trim() + note.trim()`,以下情况都会漏掉:
 *
 *   - "Mercadona" vs "MERCADONA" vs "mercadona" → 大小写
 *   - "塑料袋" vs "塑料袋 "(尾部全角空格)→ trim 不到
 *   - "在  西班牙"(连续空格)vs "在 西班牙"(单空格)→ 不同
 *   - "Mercadona　Sevilla"(全角空格)vs "Mercadona Sevilla"(半角)→ 不同
 *   - "Café"(预合成)vs "Café"(组合字符 e + ́)→ 看起来一样,代码点不一样
 *
 * 新归一化:
 *   1. NFKC:全角→半角、组合字符→预合成、上下标→普通字符
 *   2. /\s+/ → ' ':任意空白(空格、Tab、换行、全角空格)折叠成一个半角空格
 *   3. trim
 *   4. lowercase
 *
 * 这样 "Mercadona" / "MERCADONA" / "Mercadona　" 全部归一到 "mercadona",
 * 同金额 + 同日期 + 同商家(归一后)+ 同备注(归一后)= 同一笔。
 *
 * keeper 选取(沿用):
 *   1. sync_status='synced' 优先(它的 id 已和云端绑,留它推时不撞)
 *   2. 同状态下 created_at 早的优先
 */

import { db } from '@/db'
import { financeRepo } from '@/repositories'
import type { FinanceTransaction } from '@/types'

export interface FinanceDedupReport {
  groupsFound: number
  duplicatesRemoved: number
  affectedSamples: string[]
}

/** 文本归一化 —— importer 和 dedup 必须用同一个,否则两边判重对不齐 */
export function normalizeText(s: string): string {
  if (!s) return ''
  return s
    .normalize('NFKC') // 全角→半角、合成字符等
    .replace(/\s+/g, ' ') // 各种空白折叠
    .trim()
    .toLowerCase()
}

/** 内容键 —— 跟 migrate-xlsx 保持完全一致 */
export function makeFinanceContentKey(
  userId: string,
  occurredAt: string,
  amount: number,
  participant: string,
  note: string,
): string {
  return [
    userId,
    occurredAt,
    amount.toFixed(2),
    normalizeText(participant),
    normalizeText(note),
  ].join('|')
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

    if (samples.length < 8) {
      const dt = new Date(keeper.occurred_at).toISOString().slice(0, 10)
      const part = keeper.participant?.trim() || '(无商家)'
      samples.push(`${dt} ${part} €${keeper.amount.toFixed(2)} ×${arr.length}`)
    }

    for (let i = 1; i < arr.length; i++) {
      try {
        await financeRepo.softDelete(arr[i]!.id)
        duplicatesRemoved++
      } catch {
        // 已删/找不到等情况吞掉
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
    const k = makeFinanceContentKey(
      r.user_id,
      r.occurred_at,
      r.amount,
      r.participant ?? '',
      r.note ?? '',
    )
    const arr = m.get(k) ?? []
    arr.push(r)
    m.set(k, arr)
  }
  return m
}
