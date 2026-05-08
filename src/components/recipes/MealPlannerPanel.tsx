import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { X, Clock, ShoppingCart, Check, AlertCircle, Shuffle, Info } from 'lucide-react'
import { db } from '@/db'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { addRecipeToShopping } from '@/lib/kitchen-flow'
import {
  checkAvailability,
  filterRecipesByDuration,
  filterRecipesByMealType,
} from '@/lib/recipe-availability'
import type { MealType, PantryItem, Recipe, RecipeItem } from '@/types'
import { MEAL_TYPES } from '@/types'

/**
 * 用餐预订 7 天视图(2026-05 升级版)。
 *
 * 这一版改了 4 件事:
 *
 * 1. **6 个餐次**(以前只有 3 个):早餐/午餐/晚餐 + 零食/饮品/夜宵。
 *    数据模型早就在 MEAL_TYPES 里定义了 6 种,只是 planner 自己写死成 3 个。
 *
 * 2. **一餐多菜**:每个 slot 现在存 string[] 而不是 string|null。
 *    点 + 加菜可以连续添加多道,picker 不会关。X 单独移除某道。
 *
 * 3. **随机配餐**(🎲):只填空格,不覆盖已选。按 slot 的餐次类型过滤
 *    可选菜池,优先避开同一天重复出现的菜。
 *
 * 4. **「一键加食材」改名**:之前用户看不懂,现在叫「加进购物清单」+ 解释。
 *    行为没变 —— 把所有计划好的菜的食材合并加进购物清单(同名累加)。
 *
 * 数据存储:仍用 localStorage `meal_plan:YYYY-MM-DD`,自动迁移老格式
 * (string|null → string[],其它新 slot 缺省 [])。
 */

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'drinks', 'lateNight'] as const
type SlotKey = (typeof SLOTS)[number]

const SLOT_INFO: Record<SlotKey, { label: string; emoji: string; mealType: MealType }> = {
  breakfast: { label: '早餐', emoji: '☀️', mealType: '早饭' },
  lunch:     { label: '午餐', emoji: '🍱', mealType: '午饭' },
  dinner:    { label: '晚餐', emoji: '🌙', mealType: '晚饭' },
  snack:     { label: '零食', emoji: '🍪', mealType: '零食' },
  drinks:    { label: '饮品', emoji: '🥤', mealType: '饮品' },
  lateNight: { label: '夜宵', emoji: '🌃', mealType: '夜宵' },
}

const PLAN_KEY_PREFIX = 'meal_plan:'

type DayPlan = Record<SlotKey, string[]>

function emptyPlan(): DayPlan {
  return {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
    drinks: [],
    lateNight: [],
  }
}

/** 老数据迁移:string|null → string[];缺失的 slot → [] */
function normalizeSlot(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string')
  if (typeof v === 'string' && v) return [v]
  return []
}

function loadPlan(dayKey: string): DayPlan {
  try {
    const raw = localStorage.getItem(PLAN_KEY_PREFIX + dayKey)
    if (!raw) return emptyPlan()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      breakfast: normalizeSlot(parsed.breakfast),
      lunch: normalizeSlot(parsed.lunch),
      dinner: normalizeSlot(parsed.dinner),
      snack: normalizeSlot(parsed.snack),
      drinks: normalizeSlot(parsed.drinks),
      lateNight: normalizeSlot(parsed.lateNight),
    }
  } catch {
    return emptyPlan()
  }
}

function savePlan(dayKey: string, plan: DayPlan): void {
  try {
    localStorage.setItem(PLAN_KEY_PREFIX + dayKey, JSON.stringify(plan))
  } catch {
    // ignore
  }
}

function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 给定 slot 的餐次类型,返回适合的菜:
 *   - 菜的 meal_types 含此餐次 → 严格匹配
 *   - 菜的 meal_types 为空 → "万能"菜,任何 slot 都行
 */
function recipesForMealType(mealType: MealType, recipes: Recipe[]): Recipe[] {
  return recipes.filter(
    (r) => !r.meal_types || r.meal_types.length === 0 || r.meal_types.includes(mealType),
  )
}

/* ────────────────────────────────────────────────── */

export function MealPlannerPanel() {
  const today = new Date()
  const [pickerOpen, setPickerOpen] = useState<{ dayKey: string; slot: SlotKey } | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [tip, setTip] = useState(false)
  const [allPlans, setAllPlans] = useState(0) // 强制刷新 localStorage 读

  const recipes = useLiveQuery(
    () => db.recipes.filter((r) => !r.deleted_at).sortBy('name'),
    [],
    [],
  )
  const allItems = useLiveQuery(
    () => db.recipe_items.filter((i) => !i.deleted_at).toArray(),
    [],
    [],
  )
  const pantry = useLiveQuery(
    () => db.pantry_items.filter((p) => !p.deleted_at).toArray(),
    [],
    [],
  )

  const itemsByRecipe = useMemo(() => {
    const m = new Map<string, RecipeItem[]>()
    for (const it of allItems ?? []) {
      const arr = m.get(it.recipe_id) ?? []
      arr.push(it)
      m.set(it.recipe_id, arr)
    }
    return m
  }, [allItems])

  // 7 天:今天起向后
  const days = useMemo(() => {
    const arr: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      arr.push(d)
    }
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.toDateString()])

  const dayPlans = useMemo(() => {
    return days.map((d) => ({ date: d, key: dayKeyOf(d), plan: loadPlan(dayKeyOf(d)) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, allPlans])

  /** 通用更新:对某天某 slot 应用变换 */
  function updateSlot(
    dKey: string,
    slot: SlotKey,
    transform: (current: string[]) => string[],
  ) {
    const plan = loadPlan(dKey)
    const next: DayPlan = { ...plan, [slot]: transform(plan[slot]) }
    savePlan(dKey, next)
    setAllPlans((n) => n + 1)
  }

  function addRecipeTo(dKey: string, slot: SlotKey, recipeId: string) {
    updateSlot(dKey, slot, (cur) => (cur.includes(recipeId) ? cur : [...cur, recipeId]))
  }

  function removeRecipeFrom(dKey: string, slot: SlotKey, recipeId: string) {
    updateSlot(dKey, slot, (cur) => cur.filter((id) => id !== recipeId))
  }

  function clearSlot(dKey: string, slot: SlotKey) {
    updateSlot(dKey, slot, () => [])
  }

  /** 随机填充所有空格 —— 已填的不动 */
  function randomFillEmpty() {
    const allRecipes = recipes ?? []
    if (allRecipes.length === 0) {
      setFeedback('没菜可选 —— 先去"菜单"tab 加几道')
      setTimeout(() => setFeedback(null), 3500)
      return
    }

    let filled = 0
    let skipped = 0

    for (const dp of dayPlans) {
      // 记录这一天已经选过的菜,后续 slot 优先避开
      const usedToday = new Set<string>()
      for (const slot of SLOTS) {
        for (const id of dp.plan[slot]) usedToday.add(id)
      }

      const nextPlan: DayPlan = { ...dp.plan }
      let dayChanged = false

      for (const slot of SLOTS) {
        if (nextPlan[slot].length > 0) continue // 不覆盖已选

        // 池:严格匹配餐次的菜;不够再退到全部
        let pool = recipesForMealType(SLOT_INFO[slot].mealType, allRecipes)
        if (pool.length === 0) pool = allRecipes

        // 优先避开当天已选的
        const fresh = pool.filter((r) => !usedToday.has(r.id))
        const final = fresh.length > 0 ? fresh : pool

        if (final.length === 0) {
          skipped++
          continue
        }

        const pick = final[Math.floor(Math.random() * final.length)]!
        nextPlan[slot] = [pick.id]
        usedToday.add(pick.id)
        filled++
        dayChanged = true
      }

      if (dayChanged) savePlan(dp.key, nextPlan)
    }

    setAllPlans((n) => n + 1)

    if (filled === 0) {
      setFeedback('没有空格可填(全部满了 / 随机池为空)')
    } else if (skipped > 0) {
      setFeedback(`✓ 填了 ${filled} 个空格(${skipped} 个找不到合适的菜,跳过)`)
    } else {
      setFeedback(`🎲 随机填了 ${filled} 个空格`)
    }
    setTimeout(() => setFeedback(null), 4000)
  }

  async function addAllToShopping() {
    const ids: string[] = []
    for (const dp of dayPlans) {
      for (const slot of SLOTS) {
        for (const id of dp.plan[slot]) ids.push(id)
      }
    }
    if (ids.length === 0) {
      setFeedback('未来 7 天还没安排吃啥')
      setTimeout(() => setFeedback(null), 2500)
      return
    }
    let added = 0
    let merged = 0
    for (const id of ids) {
      const r = await addRecipeToShopping(id, 1)
      added += r.added
      merged += r.merged
    }
    setFeedback(`✓ 已加入购物清单:${added} 条新增,${merged} 条同名累加`)
    setTimeout(() => setFeedback(null), 4500)
  }

  const totalPicked = dayPlans.reduce(
    (sum, dp) => sum + SLOTS.reduce((s, k) => s + dp.plan[k].length, 0),
    0,
  )

  return (
    <div className="space-y-3">
      {/* 顶部说明 + 操作区 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p
            style={{
              fontSize: 'var(--bn-text-sm)',
              color: 'var(--bn-text-tertiary)',
              letterSpacing: '-0.005em',
            }}
          >
            未来 7 天 · 已计划 {totalPicked} 道
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="glass"
            onClick={randomFillEmpty}
            disabled={(recipes ?? []).length === 0}
            title="只填空格,已选的菜不会动"
          >
            <Shuffle size={13} strokeWidth={2} style={{ marginRight: 4, verticalAlign: -1 }} />
            随机填充空格
          </Button>

          <div className="relative">
            <Button variant="glass" onClick={() => void addAllToShopping()}>
              <ShoppingCart size={13} strokeWidth={2} style={{ marginRight: 4, verticalAlign: -1 }} />
              加进购物清单
            </Button>
            <button
              type="button"
              onClick={() => setTip((v) => !v)}
              aria-label="说明"
              className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full transition-all"
              style={{
                color: 'var(--bn-text-tertiary)',
                background: tip ? 'var(--bn-glass-strong)' : 'transparent',
              }}
            >
              <Info size={12} strokeWidth={2} />
            </button>
            {tip && (
              <div
                className="absolute right-0 top-full z-30 mt-1 w-[280px] rounded-xl p-3 text-xs leading-relaxed"
                style={{
                  background: 'var(--bn-bg)',
                  border: '0.5px solid var(--bn-glass-border)',
                  color: 'var(--bn-text-secondary)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                }}
              >
                把未来 7 天计划的所有菜需要的食材,一次性合并加到 <strong style={{ color: 'var(--bn-text-primary)' }}>购物清单</strong>。
                同名食材自动累加 —— 比如两道菜都需要土豆,变成一条「土豆」总量相加,不会重复。
                <button
                  type="button"
                  onClick={() => setTip(false)}
                  className="mt-2 block underline"
                  style={{ color: 'var(--bn-text-tertiary)' }}
                >
                  收起
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 7 天网格 */}
      <div className="space-y-2">
        {dayPlans.map(({ date, key, plan }, i) => (
          <DayRow
            key={key}
            date={date}
            isToday={i === 0}
            plan={plan}
            recipes={recipes ?? []}
            itemsByRecipe={itemsByRecipe}
            pantry={pantry ?? []}
            onPickSlot={(slot) => setPickerOpen({ dayKey: key, slot })}
            onRemoveRecipe={(slot, rid) => removeRecipeFrom(key, slot, rid)}
            onClearSlot={(slot) => clearSlot(key, slot)}
          />
        ))}
      </div>

      {feedback && (
        <p
          className="text-center"
          style={{ fontSize: 'var(--bn-text-sm)', color: 'var(--bn-positive)' }}
        >
          {feedback}
        </p>
      )}

      {pickerOpen && (
        <RecipePickerModal
          slot={pickerOpen.slot}
          dayLabel={dayPlans.find((dp) => dp.key === pickerOpen.dayKey)?.date}
          currentIds={
            dayPlans.find((dp) => dp.key === pickerOpen.dayKey)?.plan[pickerOpen.slot] ?? []
          }
          recipes={recipes ?? []}
          itemsByRecipe={itemsByRecipe}
          pantry={pantry ?? []}
          onClose={() => setPickerOpen(null)}
          onAdd={(recipeId) => addRecipeTo(pickerOpen.dayKey, pickerOpen.slot, recipeId)}
          onRemove={(recipeId) => removeRecipeFrom(pickerOpen.dayKey, pickerOpen.slot, recipeId)}
        />
      )}
    </div>
  )
}

/* ── 单日一行 ─────────────────────────────────────── */
function DayRow({
  date,
  isToday,
  plan,
  recipes,
  itemsByRecipe,
  pantry,
  onPickSlot,
  onRemoveRecipe,
  onClearSlot,
}: {
  date: Date
  isToday: boolean
  plan: DayPlan
  recipes: Recipe[]
  itemsByRecipe: Map<string, RecipeItem[]>
  pantry: PantryItem[]
  onPickSlot: (slot: SlotKey) => void
  onRemoveRecipe: (slot: SlotKey, recipeId: string) => void
  onClearSlot: (slot: SlotKey) => void
}) {
  const wd = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
  const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`

  return (
    <GlassPanel padding="md" radius="lg" variant={isToday ? 'strong' : 'default'}>
      <div className="flex items-stretch gap-2">
        {/* 日期列 */}
        <div className="flex w-12 shrink-0 flex-col items-center justify-center">
          <span
            style={{
              fontSize: 10,
              color: isToday ? 'var(--bn-accent)' : 'var(--bn-text-tertiary)',
              fontWeight: isToday ? 700 : 500,
              letterSpacing: '0.04em',
            }}
          >
            {isToday ? '今天' : `周${wd}`}
          </span>
          <span
            className="bn-mono"
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--bn-text-primary)',
              fontVariantNumeric: 'tabular-nums',
              marginTop: 1,
              letterSpacing: '-0.02em',
            }}
          >
            {dateLabel}
          </span>
        </div>

        {/* 6 个 slot:窄屏 2 列、宽屏 3 列 */}
        <div className="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-3">
          {SLOTS.map((slot) => (
            <SlotCell
              key={slot}
              slot={slot}
              recipeIds={plan[slot]}
              recipes={recipes}
              itemsByRecipe={itemsByRecipe}
              pantry={pantry}
              onClick={() => onPickSlot(slot)}
              onRemoveRecipe={(rid) => onRemoveRecipe(slot, rid)}
              onClearAll={() => onClearSlot(slot)}
            />
          ))}
        </div>
      </div>
    </GlassPanel>
  )
}

/* ── 一个 slot 单元格 ────────────────────────────── */
function SlotCell({
  slot,
  recipeIds,
  recipes,
  itemsByRecipe,
  pantry,
  onClick,
  onRemoveRecipe,
  onClearAll,
}: {
  slot: SlotKey
  recipeIds: string[]
  recipes: Recipe[]
  itemsByRecipe: Map<string, RecipeItem[]>
  pantry: PantryItem[]
  onClick: () => void
  onRemoveRecipe: (recipeId: string) => void
  onClearAll: () => void
}) {
  const info = SLOT_INFO[slot]

  if (recipeIds.length === 0) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg px-2 py-1.5 transition-all hover:bg-white/5"
        style={{
          background: 'transparent',
          border: '0.5px dashed var(--bn-glass-border)',
          color: 'var(--bn-text-tertiary)',
          fontSize: 'var(--bn-text-xs)',
          minHeight: 44,
          textAlign: 'left',
        }}
      >
        <div className="flex items-center gap-1">
          <span>{info.emoji}</span>
          <span>{info.label}</span>
        </div>
        <div style={{ marginTop: 2, opacity: 0.6 }}>+ 选菜</div>
      </button>
    )
  }

  return (
    <div
      className="group relative rounded-lg px-2 py-1.5"
      style={{
        background: 'var(--bn-glass)',
        border: '0.5px solid var(--bn-glass-border)',
        minHeight: 44,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          style={{
            fontSize: 10,
            color: 'var(--bn-text-tertiary)',
            letterSpacing: '0.04em',
          }}
        >
          {info.emoji} {info.label}
          {recipeIds.length > 1 && (
            <span className="bn-mono ml-1" style={{ opacity: 0.7 }}>
              ×{recipeIds.length}
            </span>
          )}
        </span>
        {recipeIds.length > 1 && (
          <button
            type="button"
            onClick={onClearAll}
            aria-label="清空本餐次"
            title="清空本餐次"
            className="opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: 'var(--bn-text-tertiary)' }}
          >
            <X size={11} strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="mt-0.5 space-y-0.5">
        {recipeIds.map((rid) => {
          const recipe = recipes.find((r) => r.id === rid)
          if (!recipe) {
            // 菜被删了 —— 给一个清理按钮
            return (
              <div key={rid} className="flex items-center gap-1.5">
                <span style={{ fontSize: 'var(--bn-text-xs)', color: 'var(--bn-text-tertiary)' }}>
                  (已删除的菜)
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveRecipe(rid)}
                  aria-label="移除"
                  style={{ color: 'var(--bn-text-tertiary)' }}
                >
                  <X size={10} strokeWidth={2} />
                </button>
              </div>
            )
          }
          const items = itemsByRecipe.get(recipe.id) ?? []
          const avail = items.length > 0 ? checkAvailability(items, pantry) : null
          const dotColor =
            avail?.status === 'sufficient'
              ? 'var(--bn-positive)'
              : avail?.status === 'partial'
                ? '#E0A75F'
                : 'var(--bn-text-tertiary)'

          return (
            <div key={rid} className="flex items-center gap-1.5">
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: dotColor,
                  flexShrink: 0,
                }}
              />
              <button
                type="button"
                onClick={onClick}
                className="flex-1 truncate text-left"
                title="点击管理本餐次的菜"
                style={{
                  fontSize: 'var(--bn-text-sm)',
                  fontWeight: 500,
                  color: 'var(--bn-text-primary)',
                }}
              >
                {recipe.name}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveRecipe(rid)
                }}
                aria-label="移除这道菜"
                className="opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: 'var(--bn-text-tertiary)' }}
              >
                <X size={11} strokeWidth={2} />
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onClick}
        className="mt-1 text-left transition-all hover:opacity-100"
        style={{
          fontSize: 'var(--bn-text-xs)',
          color: 'var(--bn-text-tertiary)',
          opacity: 0.6,
        }}
      >
        + 加菜
      </button>
    </div>
  )
}

/* ── Recipe picker modal —— 现在是「管理本餐次」模式 ─── */
function RecipePickerModal({
  slot,
  dayLabel,
  currentIds,
  recipes,
  itemsByRecipe,
  pantry,
  onClose,
  onAdd,
  onRemove,
}: {
  slot: SlotKey
  dayLabel?: Date
  currentIds: string[]
  recipes: Recipe[]
  itemsByRecipe: Map<string, RecipeItem[]>
  pantry: PantryItem[]
  onClose: () => void
  onAdd: (recipeId: string) => void
  onRemove: (recipeId: string) => void
}) {
  const slotInfo = SLOT_INFO[slot]
  const [mealFilter, setMealFilter] = useState<MealType | null>(slotInfo.mealType)
  const [durationFilter, setDurationFilter] = useState<number | null>(null)

  const filtered = useMemo(() => {
    let list = recipes
    list = filterRecipesByMealType(list, mealFilter)
    list = filterRecipesByDuration(list, durationFilter)
    return list
  }, [recipes, mealFilter, durationFilter])

  const currentRecipes = currentIds
    .map((id) => recipes.find((r) => r.id === id))
    .filter((r): r is Recipe => Boolean(r))

  const dateText = dayLabel
    ? `${dayLabel.getMonth() + 1}/${dayLabel.getDate()}`
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl p-5"
        style={{ background: 'var(--bn-bg)', border: '0.5px solid var(--bn-glass-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2
              style={{
                fontSize: 'var(--bn-text-lg)',
                fontWeight: 600,
                color: 'var(--bn-text-primary)',
              }}
            >
              {slotInfo.emoji} {slotInfo.label}
              {dateText && (
                <span
                  className="bn-mono ml-2"
                  style={{ fontSize: 'var(--bn-text-sm)', color: 'var(--bn-text-tertiary)' }}
                >
                  {dateText}
                </span>
              )}
            </h2>
            <p
              className="mt-0.5"
              style={{ fontSize: 'var(--bn-text-xs)', color: 'var(--bn-text-tertiary)' }}
            >
              点列表里的菜来 + 添加,可以多选
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
            style={{ color: 'var(--bn-text-tertiary)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* 已选区 */}
        {currentRecipes.length > 0 && (
          <div
            className="mb-3 rounded-xl p-2.5"
            style={{
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
            }}
          >
            <p
              className="mb-1.5"
              style={{
                fontSize: 10,
                color: 'var(--bn-text-tertiary)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              已选 {currentRecipes.length} 道
            </p>
            <div className="flex flex-wrap gap-1">
              {currentRecipes.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onRemove(r.id)}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-all hover:bg-white/10"
                  style={{
                    fontSize: 'var(--bn-text-xs)',
                    background: 'var(--bn-glass-strong)',
                    border: '0.5px solid var(--bn-glass-border)',
                    color: 'var(--bn-text-primary)',
                  }}
                  title="点击移除"
                >
                  <span>{r.name}</span>
                  <X size={10} strokeWidth={2} style={{ opacity: 0.6 }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 筛选 */}
        <div className="space-y-1.5">
          <FilterRow label="餐次">
            <FilterChip active={mealFilter === null} onClick={() => setMealFilter(null)}>
              不限
            </FilterChip>
            {MEAL_TYPES.map((m) => (
              <FilterChip
                key={m}
                active={mealFilter === m}
                onClick={() => setMealFilter(mealFilter === m ? null : m)}
              >
                {m}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="时长">
            <FilterChip
              active={durationFilter === null}
              onClick={() => setDurationFilter(null)}
            >
              不限
            </FilterChip>
            {[15, 30, 45, 60].map((mins) => (
              <FilterChip
                key={mins}
                active={durationFilter === mins}
                onClick={() => setDurationFilter(durationFilter === mins ? null : mins)}
              >
                ≤ {mins}'
              </FilterChip>
            ))}
          </FilterRow>
        </div>

        {/* 列表 */}
        <div className="mt-3 space-y-1.5">
          {filtered.length === 0 ? (
            <p
              className="py-8 text-center"
              style={{ fontSize: 'var(--bn-text-sm)', color: 'var(--bn-text-tertiary)' }}
            >
              没有符合条件的菜。去&ldquo;菜单&rdquo;tab 添加一道?
            </p>
          ) : (
            filtered.map((r) => {
              const items = itemsByRecipe.get(r.id) ?? []
              const avail = items.length > 0 ? checkAvailability(items, pantry) : null
              const isAdded = currentIds.includes(r.id)

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => (isAdded ? onRemove(r.id) : onAdd(r.id))}
                  className="w-full rounded-lg px-3 py-2 text-left transition-all hover:scale-[1.005]"
                  style={{
                    background: isAdded ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                    border: `0.5px solid ${isAdded ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="flex-1 truncate"
                      style={{
                        fontSize: 'var(--bn-text-sm)',
                        fontWeight: 600,
                        color: 'var(--bn-text-primary)',
                        letterSpacing: '-0.005em',
                      }}
                    >
                      {r.name}
                    </span>
                    <span
                      className="bn-mono shrink-0"
                      style={{ fontSize: 11, color: 'var(--bn-text-tertiary)' }}
                    >
                      <Clock
                        size={9}
                        strokeWidth={2}
                        style={{ display: 'inline-block', verticalAlign: -1, marginRight: 1 }}
                      />
                      {r.duration_minutes}'
                    </span>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5"
                      style={{
                        fontSize: 10,
                        background: isAdded ? 'var(--bn-accent)' : 'transparent',
                        color: isAdded ? '#FFF' : 'var(--bn-text-tertiary)',
                        border: `0.5px solid ${isAdded ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
                        fontWeight: 500,
                      }}
                    >
                      {isAdded ? '✓ 已加' : '+ 加'}
                    </span>
                  </div>
                  {avail && <AvailabilityLine avail={avail} />}
                </button>
              )
            })
          )}
        </div>

        {/* 完成 */}
        <div
          className="sticky bottom-0 -mx-5 -mb-5 mt-4 px-5 py-3"
          style={{
            background: 'var(--bn-bg)',
            borderTop: '0.5px solid var(--bn-glass-border)',
          }}
        >
          <Button onClick={onClose} className="w-full">
            完成 {currentRecipes.length > 0 && `(已选 ${currentRecipes.length} 道)`}
          </Button>
        </div>
      </div>
    </div>
  )
}

function AvailabilityLine({ avail }: { avail: ReturnType<typeof checkAvailability> }) {
  if (avail.status === 'sufficient') {
    return (
      <div
        className="mt-1 flex items-center gap-1"
        style={{ fontSize: 11, color: 'var(--bn-positive)' }}
      >
        <Check size={11} strokeWidth={2.4} />
        <span>食材齐全 · 可马上做</span>
      </div>
    )
  }
  return (
    <div
      className="mt-1 flex items-baseline gap-1"
      style={{
        fontSize: 11,
        color: avail.status === 'partial' ? '#E0A75F' : 'var(--bn-text-tertiary)',
      }}
    >
      <AlertCircle size={11} strokeWidth={2} style={{ alignSelf: 'center' }} />
      <span className="truncate">
        缺 {avail.missing.length} 样:
        {avail.missing.slice(0, 3).map((m) => m.name).join('、')}
        {avail.missing.length > 3 && ` 等`}
      </span>
    </div>
  )
}

/* ── 小工具 ──────────────────────────────────────── */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="uppercase"
        style={{
          fontSize: 10,
          color: 'var(--bn-text-tertiary)',
          letterSpacing: '0.06em',
          minWidth: 32,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2.5 py-0.5 transition-all"
      style={{
        fontSize: 'var(--bn-text-xs)',
        background: active ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
        color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-secondary)',
        border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
      }}
    >
      {children}
    </button>
  )
}
