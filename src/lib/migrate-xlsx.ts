/**
 * Excel 账本导入器。
 *
 * 设计原则:
 * 1. 表头自动识别 —— 在前 5 行内找包含"金额/amount"的行作为表头
 * 2. 列名宽松匹配 —— 中英常见命名都识别("年"="year"="yyyy" 等)
 * 3. 单位识别 —— "欧" → EUR, "元" → CNY, "美元" → USD,可扩展
 * 4. 防御式解析 —— 单行错误不打断整批,作为 warnings 返回
 * 5. 两阶段提交 —— parse 出预览,UI 让用户确认,再 commit 落库
 * 6. **xlsx 库通过 dynamic import 加载** —— 350KB 的库只在用户导入时下载,
 *    首屏不背锅
 *
 * 归类策略（v2，2026-05）:
 * - 商家列（merchant）→ 进 participant 字段
 * - 分类列（categoryName）→ 按分类名直接映射 category_id
 *   · 命中（精确 / 大小写无关）→ 用这个 category_id，跳过自动分类
 *   · 未命中 → 自动分类器兜底（关键字 + 学习映射），并落一条 warning
 *   · 列缺失 → 自动分类器兜底（与 v1 行为一致，向后兼容）
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
  /** 解析出的待导入流水,已是完整的 FinanceTransaction */
  transactions: FinanceTransaction[]
  /** 跳过的行数(空行 / 无法识别的行)*/
  skippedRows: number
  /** 非致命警告,例如"第 5 行单位无法识别,默认 EUR" */
  warnings: string[]
  /** 检测到的列映射 —— 让用户确认对得上 */
  columnMap: ColumnMap
  /** 表头所在行(1-based,给警告标号用)*/
  headerRow: number
  /** 这次导入按"分类列"匹配上的统计（让用户能看到效果）*/
  categoryMatchStats?: {
    /** 通过分类列直接命中的行数 */
    matchedByName: number
    /** 通过自动分类器兜底归类的行数 */
    matchedByClassifier: number
    /** 仍是未分类的行数 */
    uncategorized: number
    /** 分类列里出现过、但在系统里找不到的名字（最多 10 个，去重）*/
    unmatchedNames: string[]
  }
}

interface ColumnMap {
  year?: number
  month?: number
  day?: number
  date?: number
  type?: number
  /** 商家 / 交易对象 —— 进 participant 字段 */
  merchant?: number
  /** 分类名 —— 按名直接映射到 category_id */
  categoryName?: number
  detail?: number
  amount?: number
  currency?: number
  location?: number
}

/**
 * 表头别名。
 *
 * ⚠️ 注意"类别" vs "分类"在中文里语义重叠：
 * - 老模板（Annie 的旧 Excel）里"类别"列实际是商家名 → 归到 merchant
 * - 新模板里如果同时有"商家"和"分类"两列，分别归位
 * - "分类 / 类目 / category" 严格归到 categoryName（更具体的语义）
 */
const HEADER_ALIASES: Record<keyof ColumnMap, string[]> = {
  year: ['年', 'year', 'yyyy'],
  month: ['月', 'month', 'mm'],
  day: ['日', 'day', 'dd'],
  date: ['日期', 'date', '时间', '发生时间', 'occurred_at'],
  type: ['类型', '支出/收入', '收支', 'type', '收支类型', '收/支'],
  // 商家 —— 包含老模板里的"类别"（实际填的就是商家名）
  merchant: ['商家', '类别', 'merchant', 'store', '店铺', '对象', '交易对象'],
  // 分类 —— 真正的分类名列
  categoryName: ['分类', '类目', 'category', '归类', '类别名'],
  detail: ['明细', '内容', '描述', '备注', 'detail', 'description', 'note', 'desc'],
  amount: ['金额', '价格', '数额', 'amount', 'price', 'value', '消费'],
  currency: ['单位', '币种', 'currency', 'unit'],
  location: ['地点', '位置', '城市', 'location', 'city', 'place'],
}

/**
 * 检测列映射。优先匹配更具体的别名 —— 避免 "类别" 把 "分类" 抢走。
 *
 * 策略：
 * 1. 先精确匹配（s === alias）
 * 2. 再包含匹配（s.includes(alias)）
 * 3. 一个表头列只会被分配给一个字段（先到先得）
 */
function detectColumns(headers: unknown[]): ColumnMap {
  const map: ColumnMap = {}
  const used = new Set<number>()
  const norm = headers.map((h) =>
    h === null || h === undefined ? '' : String(h).trim().toLowerCase(),
  )

  // 阶段 1：精确匹配（优先 categoryName，再其他）
  // 这里的字段顺序很关键：把语义更具体的字段排在前面，让它们先抢列
  const fields: Array<keyof ColumnMap> = [
    'categoryName', // 优先：'分类' 应该归到这里，而不是被 merchant 的 '类别' 抢走
    'merchant',
    'date',
    'year',
    'month',
    'day',
    'type',
    'detail',
    'amount',
    'currency',
    'location',
  ]

  for (const field of fields) {
    const aliases = HEADER_ALIASES[field].map((a) => a.toLowerCase())
    // 精确
    let idx = norm.findIndex((s, i) => !used.has(i) && s !== '' && aliases.includes(s))
    // 包含（避开已用列）
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

/**
 * 找包含"金额"的行作为表头 —— 容忍前几行有标题、合计、空行等无关内容。
 */
function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i]
    if (!r) continue
    const flat = r
      .map((c) => String(c ?? '').toLowerCase())
      .join(' ')
    if (
      (flat.includes('金额') || flat.includes('amount')) &&
      (flat.includes('类') ||
        flat.includes('明细') ||
        flat.includes('日') ||
        flat.includes('date'))
    ) {
      return i
    }
  }
  return -1
}

/**
 * 解析 Excel 文件为预览 —— 不写库。让 UI 显示给用户确认。
 */
export async function parseXlsxToFinance(file: File): Promise<XlsxImportPreview> {
  // xlsx 350KB —— 只在真正导入时才下载,首屏不背锅
  const { read, utils } = await import('xlsx')

  const buf = await file.arrayBuffer()
  const wb = read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return {
      transactions: [],
      skippedRows: 0,
      warnings: ['Excel 没有工作表'],
      columnMap: {},
      headerRow: 0,
    }
  }
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    return {
      transactions: [],
      skippedRows: 0,
      warnings: ['工作表为空'],
      columnMap: {},
      headerRow: 0,
    }
  }

  const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })

  const headerRowIdx = findHeaderRow(rows)
  if (headerRowIdx < 0) {
    return {
      transactions: [],
      skippedRows: 0,
      warnings: ['未找到表头行(应至少包含"金额/amount"和"日期/类别/明细"中的一个)'],
      columnMap: {},
      headerRow: 0,
    }
  }

  const headers = rows[headerRowIdx]
  if (!headers) {
    return {
      transactions: [],
      skippedRows: 0,
      warnings: ['表头行为空'],
      columnMap: {},
      headerRow: 0,
    }
  }

  const columnMap = detectColumns(headers)

  if (columnMap.amount === undefined) {
    return {
      transactions: [],
      skippedRows: 0,
      warnings: ['必须有"金额"列。检查表头中是否有"金额/价格/amount"字样。'],
      columnMap,
      headerRow: headerRowIdx + 1,
    }
  }
  if (
    columnMap.date === undefined &&
    !(
      columnMap.year !== undefined &&
      columnMap.month !== undefined &&
      columnMap.day !== undefined
    )
  ) {
    return {
      transactions: [],
      skippedRows: 0,
      warnings: ['必须有日期列(整列"日期"或拆开的"年/月/日")'],
      columnMap,
      headerRow: headerRowIdx + 1,
    }
  }

  const dataRows = rows.slice(headerRowIdx + 1)
  const transactions: FinanceTransaction[] = []
  const warnings: string[] = []
  let skipped = 0
  const now = nowIso()
  const userId = getCurrentUserId()
  const deviceId = getDeviceId()

  // 提前拿汇率和本位币 —— 每行交易都需要根据"该行币种"算 exchange_rate
  const baseCurrency = await getBaseCurrency()
  const rates = await getRates()

  // 提前拿分类映射 —— 用于按名匹配 + 自动归类
  const cats = await categoryRepo.listAll()
  const expenseCatNameToId: Record<string, string> = {} // 关键字分类器用（仅 expense）
  const allCatNameToId: Record<string, string> = {} // 直接按名匹配用（不限 type，更宽容）
  const allCatNameToIdLower: Record<string, string> = {} // 同上但小写键
  for (const c of cats) {
    if (c.deleted_at) continue
    if (c.kind === 'expense') expenseCatNameToId[c.name] = c.id
    allCatNameToId[c.name] = c.id
    allCatNameToIdLower[c.name.toLowerCase()] = c.id
  }
  // 学习映射(已有交易里 participant→cat 的统计)
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

  // 统计：让用户看到分类列效果
  let matchedByName = 0
  let matchedByClassifier = 0
  let uncategorized = 0
  const unmatchedNamesSet = new Set<string>()

  dataRows.forEach((r, i) => {
    const lineNo = headerRowIdx + 2 + i
    if (
      !r ||
      r.every((c) => c === null || c === undefined || String(c).trim() === '')
    ) {
      skipped++
      return
    }

    // ── 日期 ─────────────────────────────────
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
          // Excel 序列号会被 SheetJS 自动转 Date,字符串也能解析
          if (v instanceof Date) {
            occurredAtIso = v.toISOString()
          } else {
            occurredAtIso = toIso(v as string | number)
          }
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

    // ── 金额 ─────────────────────────────────
    const rawAmount = r[columnMap.amount!]
    const amount = Math.abs(Number(rawAmount))
    if (!Number.isFinite(amount) || amount === 0) {
      warnings.push(`第 ${lineNo} 行:金额无效 (${rawAmount}),跳过`)
      skipped++
      return
    }

    // ── 类型 ─────────────────────────────────
    let type: 'expense' | 'income' | 'transfer' = 'expense'
    if (columnMap.type !== undefined) {
      const parsed = parseType(r[columnMap.type])
      if (parsed) type = parsed
      else if (r[columnMap.type] !== null && r[columnMap.type] !== undefined) {
        warnings.push(
          `第 ${lineNo} 行:无法识别类型 "${r[columnMap.type]}",默认为支出`,
        )
      }
    }

    // ── 货币 ─────────────────────────────────
    const currency =
      columnMap.currency !== undefined ? parseCurrency(r[columnMap.currency]) : 'EUR'
    const exchange_rate = rateToBase(currency, baseCurrency, rates)

    // ── 备注 = 明细 + 地点 ──────────────────
    const detail =
      columnMap.detail !== undefined
        ? String(r[columnMap.detail] ?? '').trim()
        : ''
    const location =
      columnMap.location !== undefined
        ? String(r[columnMap.location] ?? '').trim()
        : ''
    const note = location ? `${detail}${detail ? ' · 在 ' : '在 '}${location}` : detail

    // ── participant = 商家列 ────────────────
    const participant =
      columnMap.merchant !== undefined
        ? String(r[columnMap.merchant] ?? '').trim()
        : ''

    // ── 分类 ─────────────────────────────────
    // 策略：1) 分类列直接按名匹配 → 2) 关键字分类器兜底 → 3) null
    let category_id: string | null = null
    let matchedFromName = false

    if (columnMap.categoryName !== undefined) {
      const rawCatName = String(r[columnMap.categoryName] ?? '').trim()
      if (rawCatName) {
        // 精确 → 不区分大小写
        const direct = allCatNameToId[rawCatName] ?? allCatNameToIdLower[rawCatName.toLowerCase()]
        if (direct) {
          category_id = direct
          matchedFromName = true
        } else {
          unmatchedNamesSet.add(rawCatName)
        }
      }
    }

    // 没命中分类列 → 走自动分类器（仅 expense；和 v1 行为一致）
    if (!matchedFromName && type === 'expense') {
      const classified = classifyOne(participant, note, learnedMap, expenseCatNameToId)
      if (classified) {
        category_id = classified
        matchedByClassifier++
      }
    }

    if (matchedFromName) {
      matchedByName++
    } else if (!category_id) {
      uncategorized++
    }

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

  // 把未匹配的分类名收集到 warnings 里（每个最多说一次，限 10 个）
  const unmatchedNames = Array.from(unmatchedNamesSet).slice(0, 10)
  if (unmatchedNames.length > 0) {
    warnings.push(
      `分类列里有 ${unmatchedNamesSet.size} 个名字找不到对应分类（已用关键字兜底归类）：${unmatchedNames.join('、')}${unmatchedNamesSet.size > 10 ? ' …' : ''}`,
    )
  }

  return {
    transactions,
    skippedRows: skipped,
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

/**
 * 把预览的流水批量写入 IndexedDB。
 * 不去重 —— 同一份文件多次导入会重复。让用户自己决定要不要重复点。
 */
export async function commitXlsxImport(
  transactions: FinanceTransaction[],
): Promise<number> {
  if (transactions.length === 0) return 0
  await db.finance_transactions.bulkPut(transactions)
  syncEngine.scheduleNextPush()
  return transactions.length
}

/**
 * 清空所有记账数据 —— 给"重新导入"做后悔药。
 * 注意:这是物理删除,不会同步删除信号到云端;Phase 3 后会变成软删 + 同步。
 */
export async function clearAllFinanceData(): Promise<number> {
  const count = await db.finance_transactions.count()
  await db.finance_transactions.clear()
  return count
}
