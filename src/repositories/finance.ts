import { db } from '@/db'
import type { Account, Budget, Category, FinanceTransaction } from '@/types'
import { BaseRepository } from './base'

/**
 * 记账仓库 —— 完整示范:
 * - 继承 BaseRepository 拿到全部 CRUD
 * - 在子类里写业务专属查询(按月/按分类/统计)
 * - 永远不返回已软删的记录
 *
 * 关键:统计口径必须与未来的 Excel 导出一致。
 * 后续 Excel 导出器(Phase 4)直接调用本 repo 的查询方法,而非另写 SQL。
 */
class FinanceTransactionRepository extends BaseRepository<FinanceTransaction> {
  /**
   * 按时间范围列出未删除流水,按发生时间倒序。
   * @param startIso 起始 ISO8601(含)
   * @param endIso 结束 ISO8601(不含)
   */
  async listInRange(startIso: string, endIso: string): Promise<FinanceTransaction[]> {
    return db.finance_transactions
      .where('occurred_at')
      .between(startIso, endIso, true, false)
      .filter((t) => !t.deleted_at)
      .reverse()
      .sortBy('occurred_at')
  }

  /** 按月份(YYYY-MM)取流水 */
  async listByMonth(yearMonth: string): Promise<FinanceTransaction[]> {
    const start = `${yearMonth}-01T00:00:00.000Z`
    const [year, month] = yearMonth.split('-').map(Number)
    if (!year || !month) throw new Error(`invalid month: ${yearMonth}`)
    const next = new Date(Date.UTC(year, month, 1)).toISOString()
    return this.listInRange(start, next)
  }

  /** 按分类取流水(全时段) */
  async listByCategory(categoryId: string): Promise<FinanceTransaction[]> {
    return db.finance_transactions
      .where('category_id')
      .equals(categoryId)
      .filter((t) => !t.deleted_at)
      .toArray()
  }

  /**
   * 月度汇总(收入、支出、结余)—— 已折算为 base_currency。
   * 注意:每条流水自带历史汇率快照 exchange_rate,直接相乘即可,
   * 不要用"现在的"汇率重算历史 —— 那是 Project Aim 里钉死的口径。
   */
  async monthlySummary(yearMonth: string): Promise<{
    income: number
    expense: number
    balance: number
    count: number
  }> {
    const txs = await this.listByMonth(yearMonth)
    let income = 0
    let expense = 0
    for (const t of txs) {
      const baseAmount = t.amount * t.exchange_rate
      if (t.type === 'income') income += baseAmount
      else if (t.type === 'expense') expense += baseAmount
      // transfer 不计入收支
    }
    return { income, expense, balance: income - expense, count: txs.length }
  }
}

class AccountRepository extends BaseRepository<Account> {
  /** 按 sort_order 升序列出未归档账户 */
  async listActive(): Promise<Account[]> {
    return db.accounts
      .filter((a) => !a.deleted_at && !a.archived)
      .sortBy('sort_order')
  }
}

class CategoryRepository extends BaseRepository<Category> {
  async listByKind(kind: 'income' | 'expense'): Promise<Category[]> {
    return db.categories
      .where('kind')
      .equals(kind)
      .filter((c) => !c.deleted_at && !c.archived)
      .sortBy('sort_order')
  }
}

class BudgetRepository extends BaseRepository<Budget> {
  /** 取某月某分类的预算(category_id=null 表示总预算) */
  async getForMonth(yearMonth: string, categoryId: string | null): Promise<Budget | null> {
    const list = await db.budgets
      .where('month')
      .equals(yearMonth)
      .filter((b) => !b.deleted_at && b.category_id === categoryId)
      .toArray()
    return list[0] ?? null
  }
}

// ─── 单例导出 ───────────────────────────────────────────────────────
export const financeRepo = new FinanceTransactionRepository(db.finance_transactions)
export const accountRepo = new AccountRepository(db.accounts)
export const categoryRepo = new CategoryRepository(db.categories)
export const budgetRepo = new BudgetRepository(db.budgets)
