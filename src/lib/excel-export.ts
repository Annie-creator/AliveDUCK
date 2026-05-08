/**
 * Excel 账本导出 —— Phase D-4 用 ExcelJS 重写。
 *
 * 比之前的 SheetJS 社区版多的能力：
 *   - 字体定制(微软雅黑 + Arial 数字)
 *   - 单元格内 data bar 进度条(条件格式)
 *   - 头行配色 + 边框 + 列宽自适应
 *   - 冻结 + 自动筛选
 *
 * 仍然是 8 张 sheet,字段口径完全保持不变。
 */

import { db } from '@/db'
import {
  groupByCategory,
  groupByMonth,
  groupByParticipant,
  groupByWeek,
  isoWeekKey,
} from './finance-stats'
import { getBaseCurrency, toBaseAmount } from './currency'
import type { FinanceTransaction, Category } from '@/types'
import type { Worksheet, Cell } from 'exceljs'

export interface ExportOptions {
  startIso?: string
  endIso?: string
  includeShoppingPantry?: boolean
  /** 要从所有 sheet（包括汇总）中剔除的分类 id 列表 —— 用于排除"住宿"这种
   *  一笔顶天的大额条目,避免 data bar 被它单独顶满,日常花销之间的差距看不出来 */
  excludeCategoryIds?: string[]
}

// ── 样式 token —— 集中定义,改一处全表生效 ────────────
const FONT_BODY = { name: 'Microsoft YaHei', size: 11 }
const FONT_NUM = { name: 'Arial', size: 11 }
const FONT_HEADER = { name: 'Microsoft YaHei', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
const FONT_TITLE = { name: 'Microsoft YaHei', size: 16, bold: true, color: { argb: 'FF1F2937' } }

const FILL_HEADER = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFE07A47' }, // 暖橙
}
const FILL_TITLE = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFFDF6EC' },
}
const FILL_ZEBRA = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFF8FAFC' },
}

const BORDER_THIN = {
  top: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
  left: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
  bottom: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
  right: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
}

// 数据条颜色（随金额比例渐变长度）—— 暖绿色(收入) 暖红色(支出) 暖蓝色(中性)
const DATABAR_EXPENSE = 'FFEF4444'
const DATABAR_INCOME = 'FF22C55E'
const DATABAR_NEUTRAL = 'FF60A5FA'

export async function exportFinanceToXlsx(options: ExportOptions = {}): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const { startIso, endIso, includeShoppingPantry = true, excludeCategoryIds = [] } = options
  const baseCurrency = await getBaseCurrency()
  const excludeSet = new Set(excludeCategoryIds)

  // ── 拉数据 ──────────────────────────────────────────
  let txQuery = db.finance_transactions.filter((t) => !t.deleted_at)
  if (startIso) txQuery = txQuery.filter((t) => t.occurred_at >= startIso)
  if (endIso) txQuery = txQuery.filter((t) => t.occurred_at < endIso)
  let transactions = await txQuery.toArray()
  transactions.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))

  // 应用分类排除（剔除住宿等大额条目,让 data bar 在日常开销间区分得更清楚）
  if (excludeSet.size > 0) {
    transactions = transactions.filter(
      (t) => !t.category_id || !excludeSet.has(t.category_id),
    )
  }

  const categories = await db.categories.filter((c) => !c.deleted_at).toArray()
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const accounts = await db.accounts.filter((a) => !a.deleted_at).toArray()
  const acctMap = new Map(accounts.map((a) => [a.id, a]))

  // ── 工作簿 ──────────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator = '板鸭生存记 AliveDUCK'
  wb.lastModifiedBy = '板鸭生存记 AliveDUCK'
  wb.created = new Date()
  wb.modified = new Date()

  // ── Sheet 1: README ────────────────────────────────
  const ws1 = wb.addWorksheet('README', {
    properties: { defaultColWidth: 16 },
  })
  ws1.columns = [
    { width: 24 },
    { width: 60 },
  ]
  ws1.mergeCells('A1:B1')
  const titleCell = ws1.getCell('A1')
  titleCell.value = '板鸭生存记 · 财务与清单导出'
  titleCell.font = FONT_TITLE
  titleCell.fill = FILL_TITLE
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  ws1.getRow(1).height = 30

  const readmeRows: Array<[string, string]> = [
    ['生成时间', new Date().toLocaleString('zh-CN')],
    ['本位币', `${baseCurrency}（所有汇总都已折算到本位币）`],
    ['记录数', String(transactions.length)],
    ['', ''],
    ['工作表说明', ''],
    ['Raw_Transactions', '所有原始流水。带 ISO 周/月/年 列,可直接筛选。金额列带数据条。'],
    ['Weekly_Summary', '按 ISO 周汇总,周一为起点。'],
    ['Monthly_Summary', '按月汇总。支出列带数据条。'],
    ['Category_Summary', '按品类汇总,可直接做透视。支出列带数据条。'],
    ['Participant_Summary', '按商家/交易对象汇总,Top N 一目了然。累计支出带数据条。'],
    ['Shopping_List', '当前购物清单(未完成 + 已完成)。'],
    ['Pantry_Inventory', '当前库存。'],
    ['', ''],
    ['字段口径', ''],
    ['金额(本位)', '原币金额 × 当时锁定的汇率快照,不受现在汇率影响'],
    ['类型', 'expense=支出, income=收入, transfer=转账(不计入收支汇总)'],
  ]
  for (const [k, v] of readmeRows) {
    const row = ws1.addRow([k, v])
    row.eachCell((cell) => {
      cell.font = FONT_BODY
      cell.alignment = { vertical: 'top', wrapText: true }
    })
    if (k === '工作表说明' || k === '字段口径') {
      row.font = { ...FONT_BODY, bold: true }
      row.fill = FILL_TITLE
    }
  }

  // ── Sheet 2: Raw_Transactions ─────────────────────
  const ws2 = wb.addWorksheet('Raw_Transactions')
  ws2.columns = [
    { header: '日期', key: 'date', width: 11, style: { numFmt: 'yyyy-mm-dd' } },
    { header: '年', key: 'year', width: 7 },
    { header: '月', key: 'month', width: 6 },
    { header: 'ISO周', key: 'week', width: 11 },
    { header: '类型', key: 'type', width: 9 },
    { header: '金额_原币', key: 'amount', width: 12, style: { numFmt: '#,##0.00' } },
    { header: '币种', key: 'currency', width: 7 },
    { header: '汇率快照', key: 'rate', width: 10, style: { numFmt: '0.0000' } },
    { header: '金额_本位', key: 'baseAmount', width: 13, style: { numFmt: '#,##0.00' } },
    { header: '分类', key: 'category', width: 14 },
    { header: '商家', key: 'participant', width: 18 },
    { header: '备注', key: 'note', width: 32 },
    { header: '支付账户', key: 'account', width: 14 },
  ]
  for (const t of transactions) {
    const d = new Date(t.occurred_at)
    ws2.addRow({
      date: d,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      week: isoWeekKey(d),
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      rate: t.exchange_rate,
      baseAmount: round2(toBaseAmount(t.amount, t.exchange_rate)),
      category: t.category_id ? catMap.get(t.category_id)?.name ?? '?' : '未分类',
      participant: t.participant,
      note: t.note,
      account: t.from_account_id
        ? acctMap.get(t.from_account_id)?.name ?? '?'
        : t.to_account_id
          ? acctMap.get(t.to_account_id)?.name ?? '?'
          : '',
    })
  }
  styleSheet(ws2, transactions.length)
  // 金额本位列加 data bar (按支出/收入区分颜色用混合色)
  if (transactions.length > 0) {
    addDataBar(ws2, 'I', 2, transactions.length + 1, DATABAR_EXPENSE)
  }

  // ── Sheet 3: Weekly_Summary ────────────────────────
  const ws3 = wb.addWorksheet('Weekly_Summary')
  ws3.columns = [
    { header: 'ISO周', key: 'k', width: 12 },
    { header: '收入_本位', key: 'income', width: 14, style: { numFmt: '#,##0.00' } },
    { header: '支出_本位', key: 'expense', width: 14, style: { numFmt: '#,##0.00' } },
    { header: '结余_本位', key: 'net', width: 14, style: { numFmt: '#,##0.00' } },
    { header: '笔数', key: 'count', width: 8 },
  ]
  const weekRows = groupByWeek(transactions)
  for (const g of weekRows) {
    ws3.addRow({
      k: g.key,
      income: round2(g.income),
      expense: round2(g.expense),
      net: round2(g.net),
      count: g.count,
    })
  }
  styleSheet(ws3, weekRows.length)
  if (weekRows.length > 0) {
    addDataBar(ws3, 'B', 2, weekRows.length + 1, DATABAR_INCOME)
    addDataBar(ws3, 'C', 2, weekRows.length + 1, DATABAR_EXPENSE)
  }

  // ── Sheet 4: Monthly_Summary ───────────────────────
  const ws4 = wb.addWorksheet('Monthly_Summary')
  ws4.columns = [
    { header: '年月', key: 'k', width: 12 },
    { header: '收入_本位', key: 'income', width: 14, style: { numFmt: '#,##0.00' } },
    { header: '支出_本位', key: 'expense', width: 14, style: { numFmt: '#,##0.00' } },
    { header: '结余_本位', key: 'net', width: 14, style: { numFmt: '#,##0.00' } },
    { header: '笔数', key: 'count', width: 8 },
  ]
  const monthRows = groupByMonth(transactions)
  for (const g of monthRows) {
    ws4.addRow({
      k: g.key,
      income: round2(g.income),
      expense: round2(g.expense),
      net: round2(g.net),
      count: g.count,
    })
  }
  styleSheet(ws4, monthRows.length)
  if (monthRows.length > 0) {
    addDataBar(ws4, 'B', 2, monthRows.length + 1, DATABAR_INCOME)
    addDataBar(ws4, 'C', 2, monthRows.length + 1, DATABAR_EXPENSE)
    addDataBar(ws4, 'D', 2, monthRows.length + 1, DATABAR_NEUTRAL)
  }

  // ── Sheet 5: Category_Summary ──────────────────────
  const ws5 = wb.addWorksheet('Category_Summary')
  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + toBaseAmount(t.amount, t.exchange_rate), 0)
  ws5.columns = [
    { header: '分类', key: 'k', width: 16 },
    { header: '收入_本位', key: 'income', width: 14, style: { numFmt: '#,##0.00' } },
    { header: '支出_本位', key: 'expense', width: 14, style: { numFmt: '#,##0.00' } },
    { header: '净额_本位', key: 'net', width: 14, style: { numFmt: '#,##0.00' } },
    { header: '笔数', key: 'count', width: 8 },
    { header: '占总支出比例', key: 'pct', width: 14, style: { numFmt: '0.00%' } },
  ]
  const catRows = groupByCategory(transactions, categories)
  for (const g of catRows) {
    ws5.addRow({
      k: g.label,
      income: round2(g.income),
      expense: round2(g.expense),
      net: round2(g.net),
      count: g.count,
      pct: totalExpense > 0 ? g.expense / totalExpense : 0,
    })
  }
  styleSheet(ws5, catRows.length)
  if (catRows.length > 0) {
    addDataBar(ws5, 'C', 2, catRows.length + 1, DATABAR_EXPENSE)
    addDataBar(ws5, 'F', 2, catRows.length + 1, DATABAR_NEUTRAL)
  }

  // ── Sheet 6: Participant_Summary ───────────────────
  const ws6 = wb.addWorksheet('Participant_Summary')
  ws6.columns = [
    { header: '商家', key: 'k', width: 24 },
    { header: '累计支出_本位', key: 'expense', width: 16, style: { numFmt: '#,##0.00' } },
    { header: '笔数', key: 'count', width: 8 },
  ]
  const partRows = groupByParticipant(transactions).slice(0, 200)
  for (const g of partRows) {
    ws6.addRow({
      k: g.label,
      expense: round2(g.expense),
      count: g.count,
    })
  }
  styleSheet(ws6, partRows.length)
  if (partRows.length > 0) {
    addDataBar(ws6, 'B', 2, partRows.length + 1, DATABAR_EXPENSE)
  }

  // ── Sheet 7 & 8: Shopping & Pantry ────────────────
  if (includeShoppingPantry) {
    const ws7 = wb.addWorksheet('Shopping_List')
    ws7.columns = [
      { header: '名称', key: 'name', width: 22 },
      { header: '分类', key: 'category', width: 12 },
      { header: '数量', key: 'quantity', width: 8, style: { numFmt: '#,##0.##' } },
      { header: '单位', key: 'unit', width: 8 },
      { header: '状态', key: 'status', width: 10 },
      { header: '创建时间', key: 'createdAt', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
      { header: '完成时间', key: 'doneAt', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
      { header: '备注', key: 'note', width: 24 },
    ]
    const shopping = await db.shopping_items.filter((s) => !s.deleted_at).toArray()
    for (const s of shopping) {
      ws7.addRow({
        name: s.name,
        category: s.category,
        quantity: s.quantity,
        unit: s.unit,
        status: s.done ? '已完成' : '待买',
        createdAt: new Date(s.created_at),
        doneAt: s.done_at ? new Date(s.done_at) : null,
        note: s.note,
      })
    }
    styleSheet(ws7, shopping.length)

    const ws8 = wb.addWorksheet('Pantry_Inventory')
    ws8.columns = [
      { header: '名称', key: 'name', width: 22 },
      { header: '分类', key: 'category', width: 12 },
      { header: '数量', key: 'quantity', width: 8, style: { numFmt: '#,##0.##' } },
      { header: '单位', key: 'unit', width: 8 },
      { header: '低库存阈值', key: 'low', width: 12, style: { numFmt: '#,##0.##' } },
      { header: '是否低库存', key: 'isLow', width: 12 },
      { header: '过期日期', key: 'expires', width: 14, style: { numFmt: 'yyyy-mm-dd' } },
      { header: '备注', key: 'note', width: 22 },
      { header: '更新时间', key: 'updatedAt', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    ]
    const pantry = await db.pantry_items.filter((p) => !p.deleted_at).toArray()
    for (const p of pantry) {
      ws8.addRow({
        name: p.name,
        category: p.category,
        quantity: p.quantity,
        unit: p.unit,
        low: p.low_threshold,
        isLow: p.quantity <= p.low_threshold ? '是' : '否',
        expires: p.expires_on ? new Date(p.expires_on) : null,
        note: p.note,
        updatedAt: new Date(p.updated_at),
      })
    }
    styleSheet(ws8, pantry.length)
  }

  // ── 触发下载（浏览器端）─────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const today = new Date().toISOString().slice(0, 10)
  const filename = `板鸭生存记_财务与清单导出_${today}.xlsx`
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 0)
}

// ── 辅助函数 ─────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * 给整张 sheet 套样式：头行配色 + 字体 + 边框 + 冻结 + 自动筛选 + 行高 + 斑马
 */
function styleSheet(ws: Worksheet, dataRowCount: number): void {
  // 头行
  const header = ws.getRow(1)
  header.font = FONT_HEADER
  header.fill = FILL_HEADER
  header.alignment = { vertical: 'middle', horizontal: 'center' }
  header.height = 22
  header.eachCell((cell) => {
    cell.border = BORDER_THIN
  })

  // 数据行字体 + 边框 + 斑马 + 数字字体
  for (let r = 2; r <= dataRowCount + 1; r++) {
    const row = ws.getRow(r)
    row.eachCell({ includeEmpty: true }, (cell: Cell) => {
      // 数字单元格用 Arial 等宽,中文用微软雅黑
      const v = cell.value
      const isNum = typeof v === 'number' || (v instanceof Date)
      cell.font = isNum ? FONT_NUM : FONT_BODY
      cell.border = BORDER_THIN
      if (r % 2 === 0) cell.fill = FILL_ZEBRA
    })
  }

  // 冻结首行 + 自动筛选
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  if (dataRowCount > 0 && ws.columnCount > 0) {
    const lastCol = ws.getColumn(ws.columnCount).letter
    ws.autoFilter = `A1:${lastCol}1`
  }
}

/**
 * 在指定列范围加 data bar 条件格式。
 * ExcelJS 的 dataBar 类型 API 对应 Excel 原生条件格式。
 */
function addDataBar(
  ws: Worksheet,
  colLetter: string,
  startRow: number,
  endRow: number,
  argbColor: string,
): void {
  ws.addConditionalFormatting({
    ref: `${colLetter}${startRow}:${colLetter}${endRow}`,
    rules: [
      {
        type: 'dataBar',
        priority: 1,
        gradient: true,
        showValue: true,
        minLength: 0,
        maxLength: 80,
        cfvo: [
          { type: 'min' },
          { type: 'max' },
        ],
        color: { argb: argbColor },
      },
    ],
  })
}

void ({} as { _: FinanceTransaction; __: Category })
