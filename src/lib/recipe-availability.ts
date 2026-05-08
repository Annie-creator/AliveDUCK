/**
 * 库存可用性判断 —— Phase D-3。
 *
 * 给定一个 recipe 的食材清单 + 当前 pantry,告诉用户：
 *   - 能完整做 (sufficient)
 *   - 部分缺料 (partial),列出缺哪些 / 缺多少
 *   - 完全没料 (missing)
 *
 * 匹配规则（务实）：
 *   - 食材按 name 大小写 + 空白归一化匹配
 *   - 单位忽略 —— 因为用户可能写 "g" / "克" / "盒" 各种,
 *     精确换算太复杂, 所以同名 ingredient 任何单位都视为可用
 *     (UI 提示用户自行核对)
 */

import type { PantryItem, RecipeItem } from '@/types'

export type AvailabilityStatus = 'sufficient' | 'partial' | 'missing'

export interface AvailabilityResult {
  status: AvailabilityStatus
  /** 完整能用的食材数 */
  haveCount: number
  /** 总食材数 */
  totalCount: number
  /** 缺的食材清单 */
  missing: Array<{
    name: string
    needed: number
    needUnit: string
    have: number
    haveUnit: string
  }>
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}

/**
 * 检查菜的可用性。
 *
 * @param items 这道菜的食材清单
 * @param pantry 当前库存
 * @param servingsRatio 实际做几人份 / 食谱标准人份, 默认 1
 */
export function checkAvailability(
  items: RecipeItem[],
  pantry: PantryItem[],
  servingsRatio: number = 1,
): AvailabilityResult {
  const pantryByName = new Map<string, PantryItem>()
  for (const p of pantry) {
    pantryByName.set(normalize(p.name), p)
  }

  let haveCount = 0
  const missing: AvailabilityResult['missing'] = []

  for (const item of items) {
    const need = item.quantity * servingsRatio
    const matched = pantryByName.get(normalize(item.ingredient_name))
    const have = matched ? matched.quantity : 0
    const haveUnit = matched ? matched.unit : ''

    // 同单位时按数量比;不同单位/无库存时只看"是否存在"
    const sameUnit = matched && matched.unit.trim() === item.unit.trim()
    const enough = matched && (sameUnit ? have >= need : have > 0)

    if (enough) {
      haveCount += 1
    } else {
      missing.push({
        name: item.ingredient_name,
        needed: need,
        needUnit: item.unit,
        have,
        haveUnit,
      })
    }
  }

  let status: AvailabilityStatus
  if (missing.length === 0) status = 'sufficient'
  else if (haveCount === 0) status = 'missing'
  else status = 'partial'

  return { status, haveCount, totalCount: items.length, missing }
}

/** 按时长 + 餐次筛选食谱 */
export function filterRecipesByMealType<T extends { meal_types: string[] }>(
  recipes: T[],
  mealType: string | null,
): T[] {
  if (!mealType) return recipes
  return recipes.filter((r) => (r.meal_types || []).includes(mealType))
}

export function filterRecipesByDuration<T extends { duration_minutes: number }>(
  recipes: T[],
  maxMinutes: number | null,
): T[] {
  if (maxMinutes === null) return recipes
  return recipes.filter((r) => (r.duration_minutes || 0) <= maxMinutes)
}
