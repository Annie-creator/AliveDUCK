/**
 * 清理重复分类工具。
 *
 * 修复历史 bug 留下的脏数据:同名同 kind 的分类有多条。
 *
 * 算法:
 * 1. 按 (kind, name) 分组
 * 2. 每组挑"代表"(最早创建的那个)
 * 3. 把所有 finance_transactions / budgets 里指向被删 id 的引用,
 *    改成指向代表 id
 * 4. 把被删的分类软删(走正常的同步通道,云端也会跟着收敛)
 */

import { db } from '@/db'
import { financeRepo, budgetRepo, categoryRepo } from '@/repositories'
import type { Category } from '@/types'

export interface DedupReport {
  groupsFound: number
  duplicatesRemoved: number
  transactionsRepointed: number
  budgetsRepointed: number
}

/**
 * 检测是否有重复(快速,不修改数据)。
 * UI 用来决定"是否显示一键清理按钮"。
 */
export async function countDuplicateCategories(): Promise<number> {
  const cats = await db.categories.filter((c) => !c.deleted_at).toArray()
  const groups = groupByNameKind(cats)
  let extras = 0
  for (const arr of groups.values()) {
    if (arr.length > 1) extras += arr.length - 1
  }
  return extras
}

export async function dedupCategories(): Promise<DedupReport> {
  const cats = await db.categories.filter((c) => !c.deleted_at).toArray()
  const groups = groupByNameKind(cats)

  // 选代表 + 建立 oldId → keeperId 映射
  const remap: Map<string, string> = new Map()
  let groupsFound = 0
  let duplicatesRemoved = 0

  for (const [, arr] of groups) {
    if (arr.length <= 1) continue
    groupsFound++
    // 按 created_at 升序,第一个是代表
    arr.sort((a, b) => a.created_at.localeCompare(b.created_at))
    const keeper = arr[0]!
    for (let i = 1; i < arr.length; i++) {
      remap.set(arr[i]!.id, keeper.id)
      duplicatesRemoved++
    }
  }

  if (groupsFound === 0) {
    return { groupsFound: 0, duplicatesRemoved: 0, transactionsRepointed: 0, budgetsRepointed: 0 }
  }

  // 修流水的 category_id
  let transactionsRepointed = 0
  const allTxs = await db.finance_transactions.filter((t) => !t.deleted_at).toArray()
  for (const t of allTxs) {
    if (t.category_id && remap.has(t.category_id)) {
      await financeRepo.update(t.id, { category_id: remap.get(t.category_id)! })
      transactionsRepointed++
    }
  }

  // 修预算的 category_id
  let budgetsRepointed = 0
  const allBudgets = await db.budgets.filter((b) => !b.deleted_at).toArray()
  for (const b of allBudgets) {
    if (b.category_id && remap.has(b.category_id)) {
      await budgetRepo.update(b.id, { category_id: remap.get(b.category_id)! })
      budgetsRepointed++
    }
  }

  // 软删被合并的分类(通过 repo 走,会触发同步)
  for (const oldId of remap.keys()) {
    await categoryRepo.softDelete(oldId)
  }

  return {
    groupsFound,
    duplicatesRemoved,
    transactionsRepointed,
    budgetsRepointed,
  }
}

function groupByNameKind(cats: Category[]): Map<string, Category[]> {
  const m = new Map<string, Category[]>()
  for (const c of cats) {
    const key = `${c.kind}:${c.name}`
    const arr = m.get(key) ?? []
    arr.push(c)
    m.set(key, arr)
  }
  return m
}
