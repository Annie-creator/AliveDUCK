/**
 * Excel 账本导入器(2026-05 根治版)。
 *
 * 改的核心:**导入前按"内容键"查重**。键 = `occurred_at + amount + participant + note`,
 * 跟 dedup-finance.ts 用的判重逻辑一致。
 *
 * - 数据库已有同内容行 → 直接跳过(不创建副本,不推到云端)
 * - 同一份 Excel 内有重复行 → 第二次起也跳过(防 Excel 自身脏)
 * - 跳过统计 `alreadyExistsCount` 显示给用户,知道为啥少了
 *
 * 这把"反复点导入会造重复"这个根因彻底封掉。
 *
 * 其它原则保留:
 * 1. 表头自动识别(前 5 行内找含"金额/amount"的)
 * 2. 列名宽松匹配(中英常见命名都识别)
 * 3. 单位识别("欧"→EUR, "元"→CNY, "美元"→USD)
 * 4. 防御式解析(单行错误不打断整批)
 * 5. 两阶段提交(parse 出预览,UI 让用户确认,再 commit 落库)
 * 6. xlsx 库通过 dynamic import(350KB 库不背首屏)
 *
 * 归类策略(承袭 v2):
 * - 商家列(merchant)→ 进 participant 字段
 * - 分类列(categoryName)→ 按分类名直接映射 category_id
 *   · 命中(精确 / 大小写无关)→ 用这个 category_id,跳过自动分类
 *   · 未命中 → 自动分类器兜底
 *   · 列缺失 → 自动分类器兜底
 */

import { v4 as uuid } from 'uuid'
import { db } from '@/db'
import { CURRENT_SCHEMA_VERSION, type FinanceTransaction } from '@/types'
import { getCurrentUserId } from '@/lib/current-user'
import { getDeviceId } from '@/lib/device'
import { nowIso, toIso } from '@/lib/date'
import { syncEngine } from '@/lib/sync-engine'
import { rateToBase, getRates, getBaseCurrency } from '@/lib/currency'
import { classifyOne } from '@/lib/classifier'
import { categoryRepo } from '@/repositories'

export interface XlsxImportPreview {
  /** 解析出的待导入流水(已去过重),已是完整的 FinanceTransaction */
  transactions: FinanceTransaction[]
  /** 跳过的行数(空行/无法识别的行) */
  skippedRows: number
  /** 因为内容已存在(本地或本批)而被跳过的行数 —— 防重复导入的核心 */
  alreadyExistsCount: number
  /** 非致命警告 */
  warnings: string[]
  /** 检测到的列映射 */
  columnMap: ColumnMap
  /** 表头所在行(1-based) */
  headerRow: number
  /** 分类列匹配统计 */
  categoryMatchStats?: {
    matchedByName: number
    matchedByClassifier: number
    uncategorized: number
    unmatchedNames: string[]
  }
}

interface ColumnMap {
  year?: number
  month?: number
  day?: number
  date?: number
  type?: number
  merchant?: number
  categoryName?: number
  detail?: number
  amount?: number
  currency?: number
  location?: number
}

const HEADER_ALIASES: Record<keyof ColumnMap, string[]> = {
  year: ['年', 'year', 'yyyy'],
  month: ['月', 'month', 'mm'],
  day: ['日', 'day', 'dd'],
  date: ['日期', 'date', '时间', '发生时间', 'occurred_at'],
  type: ['类型', '支出/收入', '收支', 'type', '收支类型', '收/支'],
  merchant: ['商家', '类别', 'merchant', 'store', '店铺', '对象', '交易对象'],
  categoryName: ['分类', '类目', 'category', '归类', '类别名'],
  detail: ['明细', '内容', '描述', '备注', 'detail', 'description', 'note', 'desc'],
  amount: ['金额', '价格', '数额', 'amount', 'price', 'value', '消费'],
  currency: ['单位', '币种', 'currency', 'unit'],
  location: ['地点', '位置', '城市', 'location', 'city', 'place'],
}

function detectColumns(headers: unknown[]): ColumnMap {
  const map: ColumnMap = {}
  const used = new Set<number>()
  const norm = headers.map((h) =>
    h === null || h === undefined ? '' : String(h).trim().toLowerCase(),
  )
  const fields: Array<keyof ColumnMap> = [
    'categoryName', 'merchant', 'date', 'year', 'month', 'day',
    'type', 'detail', 'amount', 'currency', 'location',
  ]

  for (const field of fields) {
    const aliases = HEADER_ALIASES[field].map((a) => a.toLowerCase())
    let idx = norm.findIndex((s, i) => !used.has(i) && s !== '' && aliases.includes(s))
    if (idx < 0) {
      idx = norm.findIndex(
        (s, i) => !used.has(i) && s !== '' && aliases.some((a) => s.includes(a)),
      )
    }
    if (idx >= 0) {
      ;(map as Record<string, number>)[field] = idx
      used.add(idx)
    }
  }

  return map
}

function parseCurrency(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return 'EUR'
  if (s === '欧' || s === 'eur' || s === '€' || s.includes('欧元')) return 'EUR'
  if (s === '元' || s === '人民币' || s === 'cny' || s === '¥' || s === 'rmb') return 'CNY'
  if (s === '美' || s === '美元' || s === 'usd' || s === '$') return 'USD'
  if (s === '英镑' || s === 'gbp' || s === '£') return 'GBP'
  if (s === '丹麦' || s === '丹麦克朗' || s === 'dkk' || s === 'kr') return 'DKK'
  if (s === '瑞郎' || s === '瑞士法郎' || s === 'chf') return 'CHF'
  return 'EUR'
}

function parseType(raw: unknown): 'expense' | 'income' | 'transfer' | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return null
  if (s.includes('支出') || s.includes('expense') || s.includes('out') || s === '-') return 'expense'
  if (s.includes('收入') || s.includes('income') || s.includes('in') || s === '+') return 'income'
  if (s.includes('转账') || s.includes('transfer')) return 'transfer'
  return null
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i]
    if (!r) continue
    const flat = r.map((c) => String(c ?? '').toLowerCase()).join(' ')
    if (
      (flat.includes('金额') || flat.includes('amount')) &&
      (flat.includes('类') || flat.includes('明细') || flat.includes('日') || flat.includes('date'))
    ) {
      return i
    }
  }
  return -1
}

/** 内容键 —— 跟 dedup-finance.ts 完全一致,确保两边判重逻辑统一 */
function makeContentKey(occurredAt: string, amount: number, participant: string, note: string): string {
  return `${occurredAt}|${amount.toFixed(2)}|${participant.trim()}|${note.trim()}`
}

export async function parseXlsxToFinance(file: File): Promise<XlsxImportPreview> {
  const { read, utils } = await import('xlsx')

  const buf = await file.arrayBuffer()
  const wb = read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return emptyPreview(['Excel 没有工作表'])
  }
  const sheet = wb.Sheets[sheetName]
  if (!sheet) return emptyPreview(['工作表为空'])

  const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

  const headerRowIdx = findHeaderRow(rows)
  if (headerRowIdx < 0) {
    return emptyPreview([
      '未找到表头行(应至少包含"金额/amount"和"日期/类别/明细"中的一个)',
    ])
  }

  const headers = rows[headerRowIdx]
  if (!headers) return emptyPreview(['表头行为空'])

  const columnMap = detectColumns(headers)

  if (columnMap.amount === undefined) {
    return emptyPreview(
      ['必须有"金额"列。检查表头中是否有"金额/价格/amount"字样。'],
      columnMap,
      headerRowIdx + 1,
    )
  }
  if (
    columnMap.date === undefined &&
    !(columnMap.year !== undefined && columnMap.month !== undefined && columnMap.day !== undefined)
  ) {
    return emptyPreview(
      ['必须有日期列(整列"日期"或拆开的"年/月/日")'],
      columnMap,
      headerRowIdx + 1,
    )
  }

  const dataRows = rows.slice(headerRowIdx + 1)
  const transactions: FinanceTransaction[] = []
  const warnings: string[] = []
  let skipped = 0
  let alreadyExistsCount = 0
  const now = nowIso()
  const userId = getCurrentUserId()
  const deviceId = getDeviceId()

  const baseCurrency = await getBaseCurrency()
  const rates = await getRates()

  // ── 取分类映射(分类列匹配 + 关键字兜底用)──
  const cats = await categoryRepo.listAll()
  const expenseCatNameToId: Record<string, string> = {}
  const allCatNameToId: Record<string, string> = {}
  const allCatNameToIdLower: Record<string, string> = {}
  for (const c of cats) {
    if (c.deleted_at) continue
    if (c.kind === 'expense') expenseCatNameToId[c.name] = c.id
    allCatNameToId[c.name] = c.id
    allCatNameToIdLower[c.name.toLowerCase()] = c.id
  }
  const learnedMap: Record<string, string> = {}
  const seenTxs = await db.finance_transactions
    .filter((t) => !t.deleted_at && !!t.category_id && !!t.participant)
    .toArray()
  const tally: Record<string, Record<string, number>> = {}
  for (const t of seenTxs) {
    const p = t.participant.trim().toLowerCase()
    if (!p) continue
    const catName = cats.find((c) => c.id === t.category_id)?.name
    if (!catName) continue
    tally[p] = tally[p] ?? {}
    tally[p]![catName] = (tally[p]![catName] ?? 0) + 1
  }
  for (const [p, byName] of Object.entries(tally)) {
    const top = Object.entries(byName).sort((a, b) => b[1] - a[1])[0]
    if (top && top[1] >= 2) learnedMap[p] = top[0]
  }

  // ── ★★★ 内容查重的核心 ★★★ ──
  // 取本地所有 alive 的流水,按内容键索引。导入时遇到同键直接跳。
  // 同时维护一个 seenInBatch,防 Excel 自身有重复行被都收下。
  const allExistingAlive = await db.finance_transactions
    .filter((t) => !t.deleted_at)
    .toArray()
  const existingContentKeys = new Set<string>()
  for (const t of allExistingAlive) {
    existingContentKeys.add(
      makeContentKey(t.occurred_at, t.amount, t.participant ?? '', t.note ?? ''),
    )
  }
  const seenInBatch = new Set<string>()

  // 分类列效果统计
  let matchedByName = 0
  let matchedByClassifier = 0
  let uncategorized = 0
  const unmatchedNamesSet = new Set<string>()

  dataRows.forEach((r, i) => {
    const lineNo = headerRowIdx + 2 + i
    if (!r || r.every((c) => c === null || c === undefined || String(c).trim() === '')) {
      skipped++
      return
    }

    // 日期
    let occurredAtIso: string | null = null
    if (
      columnMap.year !== undefined &&
      columnMap.month !== undefined &&
      columnMap.day !== undefined
    ) {
      const y = Number(r[columnMap.year])
      const m = Number(r[columnMap.month])
      const d = Number(r[columnMap.day])
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
        occurredAtIso = new Date(Date.UTC(y, m - 1, d)).toISOString()
      }
    } else if (columnMap.date !== undefined) {
      const v = r[columnMap.date]
      if (v !== null && v !== undefined && v !== '') {
        try {
          if (v instanceof Date) occurredAtIso = v.toISOString()
          else occurredAtIso = toIso(v as string | number)
        } catch {
          // skip
        }
      }
    }
    if (!occurredAtIso) {
      warnings.push(`第 ${lineNo} 行:无法解析日期,跳过`)
      skipped++
      return
    }

    // 金额
    const rawAmount = r[columnMap.amount!]
    const amount = Math.abs(Number(rawAmount))
    if (!Number.isFinite(amount) || amount === 0) {
      warnings.push(`第 ${lineNo} 行:金额无效 (${rawAmount}),跳过`)
      skipped++
      return
    }

    // 类型
    let type: 'expense' | 'income' | 'transfer' = 'expense'
    if (columnMap.type !== undefined) {
      const parsed = parseType(r[columnMap.type])
      if (parsed) type = parsed
      else if (r[columnMap.type] !== null && r[columnMap.type] !== undefined) {
        warnings.push(`第 ${lineNo} 行:无法识别类型 "${r[columnMap.type]}",默认为支出`)
      }
    }

    // 货币
    const currency =
      columnMap.currency !== undefined ? parseCurrency(r[columnMap.currency]) : 'EUR'
    const exchange_rate = rateToBase(currency, baseCurrency, rates)

    // 备注 = 明细 + 地点
    const detail =
      columnMap.detail !== undefined ? String(r[columnMap.detail] ?? '').trim() : ''
    const location =
      columnMap.location !== undefined ? String(r[columnMap.location] ?? '').trim() : ''
    const note = location ? `${detail}${detail ? ' · 在 ' : '在 '}${location}` : detail

    // 商家
    const participant =
      columnMap.merchant !== undefined ? String(r[columnMap.merchant] ?? '').trim() : ''

    // ★★★ 内容查重 —— 在做分类工作之前先短路,省力 ★★★
    const contentKey = makeContentKey(occurredAtIso, amount, participant, note)
    if (seenInBatch.has(contentKey)) {
      alreadyExistsCount++
      // Excel 内部重复,静默(不刷屏 warnings)
      return
    }
    if (existingContentKeys.has(contentKey)) {
      alreadyExistsCount++
      return // 库里已有,跳过
    }
    seenInBatch.add(contentKey)

    // 分类
    let category_id: string | null = null
    let matchedFromName = false
    if (columnMap.categoryName !== undefined) {
      const rawCatName = String(r[columnMap.categoryName] ?? '').trim()
      if (rawCatName) {
        const direct = allCatNameToId[rawCatName] ?? allCatNameToIdLower[rawCatName.toLowerCase()]
        if (direct) {
          category_id = direct
          matchedFromName = true
        } else {
          unmatchedNamesSet.add(rawCatName)
        }
      }
    }
    if (!matchedFromName && type === 'expense') {
      const classified = classifyOne(participant, note, learnedMap, expenseCatNameToId)
      if (classified) {
        category_id = classified
        matchedByClassifier++
      }
    }
    if (matchedFromName) matchedByName++
    else if (!category_id) uncategorized++

    transactions.push({
      id: uuid(),
      user_id: userId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      sync_status: 'pending',
      device_id: deviceId,
      schema_version: CURRENT_SCHEMA_VERSION,
      type,
      occurred_at: occurredAtIso,
      amount,
      currency,
      exchange_rate,
      category_id,
      from_account_id: null,
      to_account_id: null,
      participant,
      note,
      tag_ids: [],
    })
  })

  const unmatchedNames = Array.from(unmatchedNamesSet).slice(0, 10)
  if (unmatchedNames.length > 0) {
    warnings.push(
      `分类列里有 ${unmatchedNamesSet.size} 个名字找不到对应分类(已用关键字兜底归类):${unmatchedNames.join('、')}${unmatchedNamesSet.size > 10 ? ' …' : ''}`,
    )
  }

  return {
    transactions,
    skippedRows: skipped,
    alreadyExistsCount,
    warnings,
    columnMap,
    headerRow: headerRowIdx + 1,
    categoryMatchStats: {
      matchedByName,
      matchedByClassifier,
      uncategorized,
      unmatchedNames,
    },
  }
}

function emptyPreview(
  warnings: string[],
  columnMap: ColumnMap = {},
  headerRow = 0,
): XlsxImportPreview {
  return {
    transactions: [],
    skippedRows: 0,
    alreadyExistsCount: 0,
    warnings,
    columnMap,
    headerRow,
  }
}

export async function commitXlsxImport(
  transactions: FinanceTransaction[],
): Promise<number> {
  if (transactions.length === 0) return 0
  await db.finance_transactions.bulkPut(transactions)
  syncEngine.scheduleNextPush()
  return transactions.length
}

export async function clearAllFinanceData(): Promise<number> {
  const count = await db.finance_transactions.count()
  await db.finance_transactions.clear()
  return count
}
