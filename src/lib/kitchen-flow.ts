/**
 * 厨房三件套交互逻辑(食谱 → 购物清单 → 库存)。
 *
 * 主要 flow:
 * 1. addRecipeToShopping(recipe) — 把所有 ingredient 加入购物清单(已存在的同名条目数量累加)
 * 2. completeShoppingItem(item, addToPantry) — 标完成,可选自动入库存
 * 3. expirySoonOrLow() — 给主页显示的"该补货 / 该吃了"
 */

import { db } from '@/db'
import {
  shoppingRepo,
  pantryRepo,
  recipeItemRepo,
  recipeRepo,
} from '@/repositories'
import type {
  PantryItem,
  Recipe,
  ShoppingItem,
} from '@/types'

/** 把一个食谱的所有配料推到购物清单 */
export async function addRecipeToShopping(
  recipeId: string,
  servingMultiplier = 1,
): Promise<{ added: number; merged: number }> {
  const items = await recipeItemRepo.listByRecipe(recipeId)
  if (items.length === 0) return { added: 0, merged: 0 }

  const existing = await shoppingRepo.listPending()
  const byName = new Map(existing.map((s) => [s.name.trim().toLowerCase(), s]))

  let added = 0
  let merged = 0
  for (const it of items) {
    const key = it.ingredient_name.trim().toLowerCase()
    const have = byName.get(key)
    const qty = it.quantity * servingMultiplier
    if (have) {
      // 单位相同则累加,否则用 (X + Y unitB) 这种字符串
      if (have.unit === it.unit) {
        await shoppingRepo.update(have.id, { quantity: have.quantity + qty })
      } else {
        // 单位不一致,note 里追加
        const noteAdd = `+ ${qty} ${it.unit}`
        await shoppingRepo.update(have.id, {
          note: have.note ? `${have.note}; ${noteAdd}` : noteAdd,
        })
      }
      merged++
    } else {
      await shoppingRepo.create({
        name: it.ingredient_name,
        category: '食谱',
        quantity: qty,
        unit: it.unit,
        done: false,
        done_at: null,
        auto_to_pantry: true,
        note: '',
        tag_ids: [],
      })
      added++
    }
  }
  return { added, merged }
}

/** 标购物条目完成。auto_to_pantry 为 true 时自动入库存(已有同名条目就累加)*/
export async function completeShoppingItem(
  item: ShoppingItem,
  addToPantry: boolean,
): Promise<void> {
  await shoppingRepo.update(item.id, {
    done: true,
    done_at: new Date().toISOString(),
  })

  if (!addToPantry) return

  // 找同名 pantry
  const existing = await db.pantry_items
    .filter((p) => !p.deleted_at)
    .toArray()
  const same = existing.find(
    (p) => p.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
      p.unit === item.unit,
  )

  if (same) {
    await pantryRepo.update(same.id, { quantity: same.quantity + item.quantity })
  } else {
    await pantryRepo.create({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      low_threshold: 1,
      expires_on: null,
      note: item.note,
      tag_ids: [],
    })
  }
}

/** 库存中"低库存 + 即将过期"的合并视图,用于首页提醒 */
export interface PantryAlert {
  item: PantryItem
  reason: 'low' | 'expires_soon' | 'expired'
  daysLeft?: number
}

export async function getPantryAlerts(daysAhead = 7): Promise<PantryAlert[]> {
  const all = await db.pantry_items.filter((p) => !p.deleted_at).toArray()
  const now = Date.now()
  const horizon = now + daysAhead * 86_400_000
  const alerts: PantryAlert[] = []

  for (const item of all) {
    if (item.expires_on) {
      const exp = Date.parse(item.expires_on)
      if (exp < now) {
        alerts.push({ item, reason: 'expired' })
        continue
      }
      if (exp <= horizon) {
        alerts.push({
          item,
          reason: 'expires_soon',
          daysLeft: Math.ceil((exp - now) / 86_400_000),
        })
        continue
      }
    }
    if (item.quantity <= item.low_threshold) {
      alerts.push({ item, reason: 'low' })
    }
  }

  // 排序:过期 > 即将过期 > 低库存,同类按 daysLeft 升序
  const order = { expired: 0, expires_soon: 1, low: 2 } as const
  alerts.sort((a, b) => {
    if (order[a.reason] !== order[b.reason]) return order[a.reason] - order[b.reason]
    return (a.daysLeft ?? 0) - (b.daysLeft ?? 0)
  })

  return alerts
}

/** 把库存条目重新加回购物单(数量 1)*/
export async function rebuyPantryItem(p: PantryItem): Promise<void> {
  await shoppingRepo.create({
    name: p.name,
    category: p.category,
    quantity: 1,
    unit: p.unit,
    done: false,
    done_at: null,
    auto_to_pantry: true,
    note: '',
    tag_ids: [],
  })
}

// 让 TS 别在 ESM 严格模式下警告未导出
void recipeRepo
void ({} as Recipe)
