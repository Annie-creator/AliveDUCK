/**
 * Excel 账本导出。
 *
 * 输出 8 张 sheet,严格按 Project Aim D 节规格:
 * 1. README                  字段说明
 * 2. Raw_Transactions        原始流水(每行带 ISO 周/月/年 等冗余列方便筛选)
 * 3. Weekly_Summary          按周汇总
 * 4. Monthly_Summary         按月汇总
 * 5. Category_Summary        按品类汇总
 * 6. Participant_Summary     按商家汇总
 * 7. Shopping_List           当前购物清单
 * 8. Pantry_Inventory        当前库存
 *
 * 关键质量要求:
 * - 金额=纯 number,不带单位字符
 * - 日期=Excel date(SheetJS 的 cellDates 模式)
 * - 首行加粗 + 冻结 + 自动筛选
 * - Summary 表可直接做 Excel 透视表
 *
 * xlsx 是动态导入,只有用户真的点导出按钮时才下载这 350KB 库。
 */

import { db } from '@/db'
import {
  groupByCategory,
  groupByMonth,
  groupByParticipant,
  groupByWeek,
  isoWeekKey,
} from './finance-stats'
import { getBaseCurrency } from './currency'
import { toBaseAmount } from './currency'
import type { FinanceTransaction, Category } from '@/types'

export interface ExportOptions {
  /** 时间范围(可选,默认全部)*/
  startIso?: string
  endIso?: string
  /** 是否包含购物清单和库存表 */
  includeShoppingPantry?: boolean
}

export async function exportFinanceToXlsx(options: ExportOptions = {}): Promise<void> {
  const { utils, writeFile } = await import('xlsx')

  const { startIso, endIso, includeShoppingPantry = true } = options
  const baseCurrency = await getBaseCurrency()

  // ── 拉数据 ──────────────────────────────────────────────────
  let txQuery = db.finance_transactions.filter((t) => !t.deleted_at)
  if (startIso) txQuery = txQuery.filter((t) => t.occurred_at >= startIso)
  if (endIso) txQuery = txQuery.filter((t) => t.occurred_at < endIso)
  const transactions = await txQuery.toArray()
  transactions.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))

  const categories = await db.categories.filter((c) => !c.deleted_at).toArray()
  const catMap = new Map(categories.map((c) => [c.id, c]))

  const accounts = await db.accounts.filter((a) => !a.deleted_at).toArray()
  const acctMap = new Map(accounts.map((a) => [a.id, a]))

  // ── 工作簿 ──────────────────────────────────────────────────
  const wb = utils.book_new()

  // ── Sheet 1: README ─────────────────────────────────────────
  const readmeRows: (string | number)[][] = [
    ['板鸭生存记 · 财务与清单导出'],
    [`生成时间: ${new Date().toLocaleString('zh-CN')}`],
    [`本位币: ${baseCurrency}(所有汇总都已折算到本位币)`],
    [`记录数: ${transactions.length}`],
    [],
    ['工作表说明'],
    ['Raw_Transactions', '所有原始流水。带 ISO 周/月/年 列,可直接筛选。'],
    ['Weekly_Summary', '按 ISO 周汇总,周一为起点。'],
    ['Monthly_Summary', '按月汇总。'],
    ['Category_Summary', '按品类汇总,可直接做透视。'],
    ['Participant_Summary', '按商家/交易对象汇总,Top N 一目了然。'],
    ['Shopping_List', '当前购物清单(未完成 + 已完成)。'],
    ['Pantry_Inventory', '当前库存。'],
    [],
    ['字段口径'],
    ['金额(本位)', '原币金额 × 当时锁定的汇率快照,不受现在汇率影响'],
    ['类型', 'expense=支出, income=收入, transfer=转账(不计入收支汇总)'],
  ]
  utils.book_append_sheet(wb, utils.aoa_to_sheet(readmeRows), 'README')

  // ── Sheet 2: Raw_Transactions ──────────────────────────────
  type RawRow = {
    日期: Date
    年: number
    月: number
    ISO周: string
    类型: string
    金额_原币: number
    币种: string
    汇率快照: number
    金额_本位: number
    分类: string
    商家: string
    备注: string
    支付账户: string
    创建时间: Date
    更新时间: Date
  }
  const rawRows: RawRow[] = transactions.map((t) => {
    const d = new Date(t.occurred_at)
    return {
      日期: d,
      年: d.getFullYear(),
      月: d.getMonth() + 1,
      ISO周: isoWeekKey(d),
      类型: t.type,
      金额_原币: t.amount,
      币种: t.currency,
      汇率快照: t.exchange_rate,
      金额_本位: round2(toBaseAmount(t.amount, t.exchange_rate)),
      分类: t.category_id ? catMap.get(t.category_id)?.name ?? '?' : '未分类',
      商家: t.participant,
      备注: t.note,
      支付账户: t.from_account_id
        ? acctMap.get(t.from_account_id)?.name ?? '?'
        : t.to_account_id
          ? acctMap.get(t.to_account_id)?.name ?? '?'
          : '',
      创建时间: new Date(t.created_at),
      更新时间: new Date(t.updated_at),
    }
  })
  const rawSheet = utils.json_to_sheet(rawRows, { cellDates: true })
  freezeAndFilter(rawSheet, rawRows.length)
  utils.book_append_sheet(wb, rawSheet, 'Raw_Transactions')

  // ── Sheet 3: Weekly_Summary ───────────────────────────────
  const weekRows = groupByWeek(transactions).map((g) => ({
    ISO周: g.key,
    收入_本位: round2(g.income),
    支出_本位: round2(g.expense),
    结余_本位: round2(g.net),
    笔数: g.count,
  }))
  const weekSheet = utils.json_to_sheet(weekRows)
  freezeAndFilter(weekSheet, weekRows.length)
  utils.book_append_sheet(wb, weekSheet, 'Weekly_Summary')

  // ── Sheet 4: Monthly_Summary ──────────────────────────────
  const monthRows = groupByMonth(transactions).map((g) => ({
    年月: g.key,
    收入_本位: round2(g.income),
    支出_本位: round2(g.expense),
    结余_本位: round2(g.net),
    笔数: g.count,
  }))
  const monthSheet = utils.json_to_sheet(monthRows)
  freezeAndFilter(monthSheet, monthRows.length)
  utils.book_append_sheet(wb, monthSheet, 'Monthly_Summary')

  // ── Sheet 5: Category_Summary ─────────────────────────────
  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + toBaseAmount(t.amount, t.exchange_rate), 0)

  const catRows = groupByCategory(transactions, categories).map((g) => ({
    分类: g.label,
    收入_本位: round2(g.income),
    支出_本位: round2(g.expense),
    净额_本位: round2(g.net),
    笔数: g.count,
    占总支出比例: totalExpense > 0 ? round4(g.expense / totalExpense) : 0,
  }))
  const catSheet = utils.json_to_sheet(catRows)
  freezeAndFilter(catSheet, catRows.length)
  utils.book_append_sheet(wb, catSheet, 'Category_Summary')

  // ── Sheet 6: Participant_Summary ──────────────────────────
  const partRows = groupByParticipant(transactions).slice(0, 200).map((g) => ({
    商家: g.label,
    累计支出_本位: round2(g.expense),
    笔数: g.count,
  }))
  const partSheet = utils.json_to_sheet(partRows)
  freezeAndFilter(partSheet, partRows.length)
  utils.book_append_sheet(wb, partSheet, 'Participant_Summary')

  // ── Sheet 7 & 8: Shopping & Pantry ────────────────────────
  if (includeShoppingPantry) {
    const shopping = await db.shopping_items.filter((s) => !s.deleted_at).toArray()
    const shopRows = shopping.map((s) => ({
      名称: s.name,
      分类: s.category,
      数量: s.quantity,
      单位: s.unit,
      状态: s.done ? '已完成' : '待买',
      创建时间: new Date(s.created_at),
      完成时间: s.done_at ? new Date(s.done_at) : '',
      备注: s.note,
    }))
    const shopSheet = utils.json_to_sheet(shopRows, { cellDates: true })
    freezeAndFilter(shopSheet, shopRows.length)
    utils.book_append_sheet(wb, shopSheet, 'Shopping_List')

    const pantry = await db.pantry_items.filter((p) => !p.deleted_at).toArray()
    const pantryRows = pantry.map((p) => ({
      名称: p.name,
      分类: p.category,
      数量: p.quantity,
      单位: p.unit,
      低库存阈值: p.low_threshold,
      是否低库存: p.quantity <= p.low_threshold ? '是' : '否',
      过期日期: p.expires_on ? new Date(p.expires_on) : '',
      备注: p.note,
      更新时间: new Date(p.updated_at),
    }))
    const pantrySheet = utils.json_to_sheet(pantryRows, { cellDates: true })
    freezeAndFilter(pantrySheet, pantryRows.length)
    utils.book_append_sheet(wb, pantrySheet, 'Pantry_Inventory')
  }

  // ── 文件名 + 触发下载 ─────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const filename = `板鸭生存记_财务与清单导出_${today}.xlsx`
  writeFile(wb, filename)
}

// ── 工具函数 ─────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** 给 sheet 加冻结首行 + 自动筛选 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function freezeAndFilter(sheet: any, rowCount: number): void {
  sheet['!freeze'] = { ySplit: 1 } // 旧版,某些客户端识别
  // SheetJS 标准:用 views
  sheet['!views'] = [{ ySplit: 1 }]

  // 自动筛选范围
  if (rowCount > 0 && sheet['!ref']) {
    sheet['!autofilter'] = { ref: sheet['!ref'] }
  }
}

// 复用类型导入避免 TS 警告
void ({} as { _: FinanceTransaction; __: Category })
