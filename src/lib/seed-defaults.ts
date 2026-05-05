/**
 * 第一次启动时的默认数据 seed —— **真正幂等**版本。
 *
 * 之前版本的 bug:用 db.count() 检查是否已 seed,
 * 但 count() 不是原子的,React StrictMode + 多页面 useEffect 并发
 * 会让多次调用都看到 count=0 → 全部进入 seed 分支 → 重复 N 倍。
 *
 * 现在用两层防护:
 * 1. **In-flight promise singleton**:模块级缓存,正在 seed 时所有调用 await 同一个 promise
 * 2. **按业务唯一键(name+kind)检查**:即便 promise 缓存被清,真正插入前也按名查一遍
 */

import { categoryRepo, accountRepo } from '@/repositories'
import type { Category, Account } from '@/types'
import { db } from '@/db'

export const DEFAULT_CATEGORIES: Array<Pick<Category, 'name' | 'kind' | 'icon' | 'color' | 'sort_order' | 'parent_id' | 'archived'>> = [
  { name: '餐饮', kind: 'expense', icon: '🍽', color: '#E8743C', sort_order: 1, parent_id: null, archived: false },
  { name: '食杂', kind: 'expense', icon: '🛒', color: '#C8553D', sort_order: 2, parent_id: null, archived: false },
  { name: '交通', kind: 'expense', icon: '🚇', color: '#5B8AA8', sort_order: 3, parent_id: null, archived: false },
  { name: '住宿', kind: 'expense', icon: '🏠', color: '#7AA876', sort_order: 4, parent_id: null, archived: false },
  { name: '日用', kind: 'expense', icon: '🧴', color: '#B89968', sort_order: 5, parent_id: null, archived: false },
  { name: '学习', kind: 'expense', icon: '📚', color: '#5E5F7C', sort_order: 6, parent_id: null, archived: false },
  { name: '医疗', kind: 'expense', icon: '💊', color: '#9FB89B', sort_order: 7, parent_id: null, archived: false },
  { name: '娱乐', kind: 'expense', icon: '🎬', color: '#D4537E', sort_order: 8, parent_id: null, archived: false },
  { name: '旅行', kind: 'expense', icon: '✈', color: '#7F77DD', sort_order: 9, parent_id: null, archived: false },
  { name: '通讯', kind: 'expense', icon: '📱', color: '#888780', sort_order: 10, parent_id: null, archived: false },
  { name: '订阅', kind: 'expense', icon: '🔁', color: '#BA7517', sort_order: 11, parent_id: null, archived: false },
  { name: '其他', kind: 'expense', icon: '·', color: '#5F5E5A', sort_order: 99, parent_id: null, archived: false },

  { name: '工资', kind: 'income', icon: '💼', color: '#1D9E75', sort_order: 1, parent_id: null, archived: false },
  { name: '家里给', kind: 'income', icon: '👪', color: '#4A7068', sort_order: 2, parent_id: null, archived: false },
  { name: '退款', kind: 'income', icon: '↩', color: '#85B7EB', sort_order: 3, parent_id: null, archived: false },
  { name: '奖学金', kind: 'income', icon: '🎓', color: '#7F77DD', sort_order: 4, parent_id: null, archived: false },
  { name: '其他收入', kind: 'income', icon: '·', color: '#5F5E5A', sort_order: 99, parent_id: null, archived: false },
]

export const DEFAULT_ACCOUNTS: Array<Pick<Account, 'name' | 'type' | 'currency' | 'initial_balance' | 'icon' | 'color' | 'sort_order' | 'archived'>> = [
  { name: '欧元卡', type: 'debit_card', currency: 'EUR', initial_balance: 0, icon: '💳', color: '#5B8AA8', sort_order: 1, archived: false },
  { name: '现金 EUR', type: 'cash', currency: 'EUR', initial_balance: 0, icon: '💵', color: '#7AA876', sort_order: 2, archived: false },
  { name: '微信', type: 'wechat', currency: 'CNY', initial_balance: 0, icon: '💬', color: '#43AA8B', sort_order: 3, archived: false },
  { name: '支付宝', type: 'alipay', currency: 'CNY', initial_balance: 0, icon: '🅰', color: '#4D9DE0', sort_order: 4, archived: false },
]

export interface SeedResult {
  seededCategories: number
  seededAccounts: number
}

/** 模块级单飞 promise —— 防 React StrictMode 重入 */
let inFlight: Promise<SeedResult> | null = null

export function ensureDefaults(): Promise<SeedResult> {
  if (inFlight) return inFlight

  inFlight = doSeed().finally(() => {
    // 完成后保留一段时间(2 秒)再清,容忍非常密集的连环调用
    setTimeout(() => {
      inFlight = null
    }, 2000)
  })
  return inFlight
}

async function doSeed(): Promise<SeedResult> {
  let seededCategories = 0
  let seededAccounts = 0

  try {
    // ── 分类 ──────────────────────────────────────────────
    // 直接读全表,按 (name, kind) 建索引,避免每次 create 前 N 次查询
    const existingCats = await db.categories
      .filter((c) => !c.deleted_at)
      .toArray()
    const existingKeys = new Set(
      existingCats.map((c) => `${c.kind}:${c.name}`),
    )

    for (const c of DEFAULT_CATEGORIES) {
      const key = `${c.kind}:${c.name}`
      if (existingKeys.has(key)) continue
      await categoryRepo.create(c)
      existingKeys.add(key) // 同步标记,防止本次循环里再次插入
      seededCategories++
    }

    // ── 账户 ──────────────────────────────────────────────
    const existingAccts = await db.accounts
      .filter((a) => !a.deleted_at)
      .toArray()
    const acctKeys = new Set(existingAccts.map((a) => `${a.currency}:${a.name}`))

    for (const a of DEFAULT_ACCOUNTS) {
      const key = `${a.currency}:${a.name}`
      if (acctKeys.has(key)) continue
      await accountRepo.create(a)
      acctKeys.add(key)
      seededAccounts++
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[seed] ensureDefaults failed:', e)
  }

  return { seededCategories, seededAccounts }
}
