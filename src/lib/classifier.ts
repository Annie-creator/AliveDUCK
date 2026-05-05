/**
 * 智能归类引擎。
 *
 * 工作方式(三层):
 * 1. **学习的商家映射**(优先):用户手动改过类的商家,settings 里记一条
 *    → 下次同名商家自动归类
 * 2. **关键字字典**:中英文常见关键词 → 分类名
 *    例:'mercadona' / 'carrefour' → 食杂
 * 3. **fallback**:其他 / 默认按支出类归到"其他"
 *
 * 智能归类不修改用户已经手动设过的类(保留人类决定)。
 */

import { categoryRepo, settingsRepo, financeRepo } from '@/repositories'
import { db } from '@/db'
import { SETTING_KEYS } from '@/types'

/** 商家学习映射 settings key */
const MERCHANT_KEY = 'merchant_category_map' as const

/**
 * 关键字 → 分类名 字典。
 * 关键字小写,用包含匹配。多个关键字命中按字典顺序取第一个。
 *
 * 调过几条本人在 Spain 留学常用商家,后续可以由用户手动改商家映射来覆盖。
 */
const KEYWORD_RULES: Array<[string, string]> = [
  // 食杂超市(西班牙常见)
  ['mercadona', '食杂'],
  ['carrefour', '食杂'],
  ['家乐福', '食杂'],
  ['cash fresh', '食杂'],
  ['lidl', '食杂'],
  ['aldi', '食杂'],
  ['dia', '食杂'],
  ['el jamon', '食杂'],
  ['ei jamon', '食杂'],
  ['mas ', '食杂'],
  ['中国小超市', '食杂'],
  ['中国超市', '食杂'],
  ['亚超', '食杂'],
  ['超市', '食杂'],
  ['supermercado', '食杂'],

  // 餐饮
  ['汉堡王', '餐饮'],
  ['burger king', '餐饮'],
  ['麦当劳', '餐饮'],
  ['mcdonald', '餐饮'],
  ['kfc', '餐饮'],
  ['星巴克', '餐饮'],
  ['starbucks', '餐饮'],
  ['海底捞', '餐饮'],
  ['餐厅', '餐饮'],
  ['饮食', '餐饮'],
  ['restaurante', '餐饮'],
  ['cafetería', '餐饮'],
  ['cafe ', '餐饮'],
  ['café', '餐饮'],
  ['pizza', '餐饮'],
  ['kebab', '餐饮'],
  ['tapas', '餐饮'],
  ['bar ', '餐饮'],

  // 交通
  ['renfe', '交通'],
  ['cercanías', '交通'],
  ['cercanias', '交通'],
  ['metro', '交通'],
  ['emt', '交通'],
  ['cabify', '交通'],
  ['uber', '交通'],
  ['打车', '交通'],
  ['出租车', '交通'],
  ['机场', '交通'],
  ['机票', '交通'],
  ['火车', '交通'],
  ['高铁', '交通'],
  ['地铁', '交通'],
  ['公交', '交通'],
  ['blablacar', '交通'],
  ['flixbus', '交通'],

  // 住宿
  ['房租', '住宿'],
  ['住宿', '住宿'],
  ['yugo', '住宿'],
  ['airbnb', '住宿'],
  ['booking', '住宿'],
  ['酒店', '住宿'],
  ['hostel', '住宿'],
  ['hotel', '住宿'],
  ['la 15', '住宿'],

  // 通讯
  ['vodafone', '通讯'],
  ['movistar', '通讯'],
  ['orange', '通讯'],
  ['o2', '通讯'],
  ['流量', '通讯'],
  ['话费', '通讯'],
  ['电话', '通讯'],
  ['网费', '通讯'],

  // 订阅
  ['netflix', '订阅'],
  ['spotify', '订阅'],
  ['apple', '订阅'],
  ['icloud', '订阅'],
  ['notion', '订阅'],
  ['chatgpt', '订阅'],
  ['会员', '订阅'],

  // 娱乐
  ['filmoteca', '娱乐'],
  ['电影', '娱乐'],
  ['cine', '娱乐'],
  ['cinema', '娱乐'],
  ['游戏', '娱乐'],
  ['steam', '娱乐'],
  ['ktv', '娱乐'],
  ['concierto', '娱乐'],
  ['concert', '娱乐'],

  // 学习
  ['学费', '学习'],
  ['课程', '学习'],
  ['书 ', '学习'],
  ['libro', '学习'],
  ['book', '学习'],
  ['coursera', '学习'],
  ['udemy', '学习'],

  // 医疗
  ['药', '医疗'],
  ['farmacia', '医疗'],
  ['pharmacy', '医疗'],
  ['医院', '医疗'],
  ['hospital', '医疗'],
  ['诊所', '医疗'],
  ['clinic', '医疗'],

  // 旅行(独立于交通,带"旅行"语义)
  ['ryanair', '旅行'],
  ['vueling', '旅行'],
  ['iberia', '旅行'],
  ['easyjet', '旅行'],
  ['air ', '旅行'],
]

/** 读取学习的商家映射(participant 名称小写 → category 名)*/
async function loadLearnedMap(): Promise<Record<string, string>> {
  const v = await settingsRepo.getValue<Record<string, string>>(MERCHANT_KEY)
  return v ?? {}
}

/** 写入一条商家学习 —— 用户手动归类时调用 */
export async function rememberMerchantCategory(
  participant: string,
  categoryName: string,
): Promise<void> {
  const key = participant.trim().toLowerCase()
  if (!key) return
  const current = await loadLearnedMap()
  current[key] = categoryName
  await settingsRepo.setValue(MERCHANT_KEY, current)
}

/**
 * 单条记录归类:返回分类的 categoryId,找不到返回 null。
 * @param participant 商家名(优先级最高)
 * @param note 备注(次优,作 fallback 关键字源)
 * @param learnedMap 学习的商家映射(由调用方批量预加载,避免 N 次查询)
 * @param nameToId 分类名 → id 映射(同样批量预加载)
 */
export function classifyOne(
  participant: string,
  note: string,
  learnedMap: Record<string, string>,
  nameToId: Record<string, string>,
): string | null {
  const p = participant.trim().toLowerCase()
  const n = note.toLowerCase()

  // 1) 学习的商家映射(优先)
  if (p && learnedMap[p]) {
    const id = nameToId[learnedMap[p]!]
    if (id) return id
  }

  // 2) 关键字字典
  const haystack = `${p} ${n}`
  for (const [keyword, catName] of KEYWORD_RULES) {
    if (haystack.includes(keyword)) {
      const id = nameToId[catName]
      if (id) return id
    }
  }

  return null
}

/**
 * 批量回填:给所有 category_id=null 的支出流水跑一遍智能归类。
 * 不动已经手动归类过的(category_id 非 null)。
 * 不动收入(用户通常自己归类收入)。
 */
export async function backfillCategories(): Promise<{
  classified: number
  totalScanned: number
  byCategory: Record<string, number>
}> {
  // 1) 一次性预加载映射
  const cats = await categoryRepo.listAll()
  const nameToId: Record<string, string> = {}
  for (const c of cats) nameToId[c.name] = c.id

  const learnedMap = await loadLearnedMap()

  // 2) 扫描所有未归类的支出流水
  const candidates = await db.finance_transactions
    .filter(
      (t) => !t.deleted_at && t.type === 'expense' && t.category_id === null,
    )
    .toArray()

  const byCategory: Record<string, number> = {}
  let classified = 0

  for (const t of candidates) {
    const catId = classifyOne(t.participant, t.note, learnedMap, nameToId)
    if (catId) {
      await financeRepo.update(t.id, { category_id: catId })
      classified++
      const catName = cats.find((c) => c.id === catId)?.name ?? '?'
      byCategory[catName] = (byCategory[catName] ?? 0) + 1
    }
  }

  return { classified, totalScanned: candidates.length, byCategory }
}

// 让 TS 把 SETTING_KEYS 标记为已用(避免被 tree-shake 掉关键字常量)
void SETTING_KEYS
