import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { X, Clock, ShoppingCart, Check, AlertCircle } from 'lucide-react'
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
 * Phase D-3: 用餐预订 7 天全显视图。
 *
 * 设计：
 *   - 横向(桌面)/纵向(手机) 7 列,每列一天 × 3 餐 slot
 *   - 点空 slot → 弹 recipe picker, 自动按 slot 餐次筛选 (早/午/晚),还可加时长筛
 *   - 已填 slot 显示菜名 + 可用性圆点 (绿:全有 / 黄:缺一些 / 灰:缺料)
 *   - 编辑菜本身请去"菜单"tab(职责分离)
 *
 * 数据：仍用 localStorage `meal_plan:YYYY-MM-DD` 存 breakfast/lunch/dinner recipe id。
 */

type MealSlot = 'breakfast' | 'lunch' | 'dinner'
const SLOT_INFO: Record<MealSlot, { label: string; emoji: string; mealType: MealType }> = {
  breakfast: { label: '早餐', emoji: '☀️', mealType: '早饭' },
  lunch: { label: '午餐', emoji: '🍱', mealType: '午饭' },
  dinner: { label: '晚餐', emoji: '🌙', mealType: '晚饭' },
}

const PLAN_KEY_PREFIX = 'meal_plan:'

interface DayPlan {
  breakfast: string | null
  lunch: string | null
  dinner: string | null
}

function loadPlan(dayKey: string): DayPlan {
  try {
    const raw = localStorage.getItem(PLAN_KEY_PREFIX + dayKey)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return { breakfast: null, lunch: null, dinner: null }
}
function savePlan(dayKey: string, plan: DayPlan): void {
  try {
    localStorage.setItem(PLAN_KEY_PREFIX + dayKey, JSON.stringify(plan))
  } catch {
    // ignore
  }
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ────────────────────────────────────────────────── */

export function MealPlannerPanel() {
  const today = new Date()
  const [pickerOpen, setPickerOpen] = useState<{ dayKey: string; slot: MealSlot } | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
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

  // 生成 7 天:今天起向后
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

  // 一次性把 7 天的 plan 全读出来
  const dayPlans = useMemo(() => {
    return days.map((d) => ({ date: d, key: dayKey(d), plan: loadPlan(dayKey(d)) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, allPlans])

  function setSlot(dKey: string, slot: MealSlot, recipeId: string | null) {
    const next = { ...loadPlan(dKey), [slot]: recipeId }
    savePlan(dKey, next)
    setAllPlans((n) => n + 1)
  }

  async function addAllToShopping() {
    const ids: string[] = []
    for (const dp of dayPlans) {
      if (dp.plan.breakfast) ids.push(dp.plan.breakfast)
      if (dp.plan.lunch) ids.push(dp.plan.lunch)
      if (dp.plan.dinner) ids.push(dp.plan.dinner)
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
    setFeedback(`✓ 已加入购物:新增 ${added},累加 ${merged}`)
    setTimeout(() => setFeedback(null), 4000)
  }

  return (
    <div className="space-y-3">
      {/* 顶部说明 + 快捷动作 */}
      <div className="flex items-center justify-between gap-3">
        <p
          style={{
            fontSize: 'var(--bn-text-sm)',
            color: 'var(--bn-text-tertiary)',
            letterSpacing: '-0.005em',
          }}
        >
          未来 7 天 · 点空格挑菜
        </p>
        <Button variant="glass" onClick={() => void addAllToShopping()}>
          <ShoppingCart size={13} strokeWidth={2} style={{ marginRight: 4, verticalAlign: -1 }} />
          一键加食材
        </Button>
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
            onClearSlot={(slot) => setSlot(key, slot, null)}
          />
        ))}
      </div>

      {feedback && (
        <p className="text-center" style={{ fontSize: 'var(--bn-text-sm)', color: 'var(--bn-positive)' }}>
          {feedback}
        </p>
      )}

      {/* Recipe picker modal */}
      {pickerOpen && (
        <RecipePickerModal
          slot={pickerOpen.slot}
          recipes={recipes ?? []}
          itemsByRecipe={itemsByRecipe}
          pantry={pantry ?? []}
          onClose={() => setPickerOpen(null)}
          onPick={(recipeId) => {
            setSlot(pickerOpen.dayKey, pickerOpen.slot, recipeId)
            setPickerOpen(null)
          }}
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
  onClearSlot,
}: {
  date: Date
  isToday: boolean
  plan: DayPlan
  recipes: Recipe[]
  itemsByRecipe: Map<string, RecipeItem[]>
  pantry: PantryItem[]
  onPickSlot: (slot: MealSlot) => void
  onClearSlot: (slot: MealSlot) => void
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

        {/* 3 个 slot */}
        <div className="grid flex-1 grid-cols-1 gap-1.5 sm:grid-cols-3">
          {(['breakfast', 'lunch', 'dinner'] as MealSlot[]).map((slot) => {
            const info = SLOT_INFO[slot]
            const recipeId = plan[slot]
            const recipe = recipeId ? recipes.find((r) => r.id === recipeId) : null

            if (!recipe) {
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => onPickSlot(slot)}
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

            const items = itemsByRecipe.get(recipe.id) ?? []
            const avail = items.length > 0 ? checkAvailability(items, pantry) : null
            const dotColor =
              avail?.status === 'sufficient'
                ? 'var(--bn-positive)'
                : avail?.status === 'partial'
                  ? '#E0A75F'
                  : 'var(--bn-text-tertiary)'

            return (
              <div
                key={slot}
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
                  </span>
                  <button
                    type="button"
                    onClick={() => onClearSlot(slot)}
                    aria-label="清除"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: 'var(--bn-text-tertiary)' }}
                  >
                    <X size={11} strokeWidth={2} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onPickSlot(slot)}
                  className="mt-0.5 flex w-full items-center gap-1.5 text-left"
                  title="点击换菜"
                >
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
                  <span
                    className="truncate"
                    style={{
                      fontSize: 'var(--bn-text-sm)',
                      fontWeight: 500,
                      color: 'var(--bn-text-primary)',
                    }}
                  >
                    {recipe.name}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </GlassPanel>
  )
}

/* ── Recipe picker modal ─────────────────────────── */
function RecipePickerModal({
  slot,
  recipes,
  itemsByRecipe,
  pantry,
  onClose,
  onPick,
}: {
  slot: MealSlot
  recipes: Recipe[]
  itemsByRecipe: Map<string, RecipeItem[]>
  pantry: PantryItem[]
  onClose: () => void
  onPick: (recipeId: string) => void
}) {
  const slotInfo = SLOT_INFO[slot]
  // 默认按 slot 的 mealType 筛选（早餐选早饭…）, 用户可改
  const [mealFilter, setMealFilter] = useState<MealType | null>(slotInfo.mealType)
  const [durationFilter, setDurationFilter] = useState<number | null>(null)

  const filtered = useMemo(() => {
    let list = recipes
    list = filterRecipesByMealType(list, mealFilter)
    list = filterRecipesByDuration(list, durationFilter)
    return list
  }, [recipes, mealFilter, durationFilter])

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
        <div className="mb-3 flex items-center justify-between">
          <h2
            style={{
              fontSize: 'var(--bn-text-lg)',
              fontWeight: 600,
              color: 'var(--bn-text-primary)',
            }}
          >
            {slotInfo.emoji} 挑一道{slotInfo.label}的菜
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
            style={{ color: 'var(--bn-text-tertiary)' }}
          >
            <X size={16} />
          </button>
        </div>

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
            <FilterChip active={durationFilter === null} onClick={() => setDurationFilter(null)}>
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
              没有符合条件的菜。去"菜单"tab 添加一道?
            </p>
          ) : (
            filtered.map((r) => {
              const items = itemsByRecipe.get(r.id) ?? []
              const avail = items.length > 0 ? checkAvailability(items, pantry) : null

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onPick(r.id)}
                  className="w-full rounded-lg px-3 py-2 text-left transition-all hover:scale-[1.005]"
                  style={{
                    background: 'var(--bn-glass)',
                    border: '0.5px solid var(--bn-glass-border)',
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="truncate"
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
                      <Clock size={9} strokeWidth={2} style={{ display: 'inline-block', verticalAlign: -1, marginRight: 1 }} />
                      {r.duration_minutes}'
                    </span>
                  </div>
                  {avail && <AvailabilityLine avail={avail} />}
                </button>
              )
            })
          )}
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
      style={{ fontSize: 11, color: avail.status === 'partial' ? '#E0A75F' : 'var(--bn-text-tertiary)' }}
    >
      <AlertCircle size={11} strokeWidth={2} style={{ alignSelf: 'center' }} />
      <span className="truncate">
        缺 {avail.missing.length} 样:
        {avail.missing
          .slice(0, 3)
          .map((m) => m.name)
          .join('、')}
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
