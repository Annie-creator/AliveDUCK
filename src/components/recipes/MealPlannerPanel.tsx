import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { recipeRepo, recipeItemRepo } from '@/repositories'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { addRecipeToShopping } from '@/lib/kitchen-flow'
import type { Recipe, RecipeItem } from '@/types'

/**
 * 用餐预订(取代旧的"食谱菜谱步骤")。
 *
 * 用法:
 * - 一道"菜"=一个 Recipe(名字+食材+人份),不强求写步骤
 * - 用户可以为某天的早/午/晚预订要做的菜
 * - 一键把当天/当周计划的所有菜的食材加入购物清单
 *
 * 数据上仍然用 Recipe + RecipeItem(schema 不变),只是 UI 改造。
 */

type MealSlot = 'breakfast' | 'lunch' | 'dinner'
const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
}

const PLAN_KEY_PREFIX = 'meal_plan:' // localStorage key 前缀: meal_plan:YYYY-MM-DD

interface DayPlan {
  breakfast: string | null // recipe id
  lunch: string | null
  dinner: string | null
}

function loadPlan(dayKey: string): DayPlan {
  try {
    const raw = localStorage.getItem(PLAN_KEY_PREFIX + dayKey)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { breakfast: null, lunch: null, dinner: null }
}

function savePlan(dayKey: string, plan: DayPlan): void {
  try {
    localStorage.setItem(PLAN_KEY_PREFIX + dayKey, JSON.stringify(plan))
  } catch {}
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function MealPlannerPanel() {
  const today = new Date()
  const [selectedDate, setSelectedDate] = useState(today)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [creating, setCreating] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const recipes = useLiveQuery(
    () => db.recipes.filter((r) => !r.deleted_at).sortBy('name'),
    [],
    [],
  )

  const dKey = dayKey(selectedDate)
  const [plan, setPlan] = useState<DayPlan>(() => loadPlan(dKey))

  // 切换日期时重读
  function pickDate(d: Date) {
    setSelectedDate(d)
    setPlan(loadPlan(dayKey(d)))
  }

  function setSlot(slot: MealSlot, recipeId: string | null) {
    const next = { ...plan, [slot]: recipeId }
    setPlan(next)
    savePlan(dKey, next)
  }

  async function addAllToShopping() {
    const ids = [plan.breakfast, plan.lunch, plan.dinner].filter(Boolean) as string[]
    if (ids.length === 0) {
      setFeedback('今天还没安排吃啥')
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

  if (creating || editingRecipe) {
    return (
      <RecipeEditor
        recipe={editingRecipe}
        onClose={() => {
          setEditingRecipe(null)
          setCreating(false)
        }}
      />
    )
  }

  // 日期导航(向前后 3 天)
  const dayOffsets = [-2, -1, 0, 1, 2]

  return (
    <div className="space-y-4">
      {/* 日期切换 */}
      <div className="flex gap-1 overflow-x-auto py-1">
        {dayOffsets.map((offset) => {
          const d = new Date(today)
          d.setDate(today.getDate() + offset)
          const isSelected = dayKey(d) === dKey
          const isToday = offset === 0
          return (
            <button
              key={offset}
              type="button"
              onClick={() => pickDate(d)}
              className="flex shrink-0 flex-col items-center rounded-xl px-3 py-2 transition-all"
              style={{
                background: isSelected ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                border: `0.5px solid ${isSelected ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
                color: 'var(--bn-text-primary)',
                minWidth: '52px',
              }}
            >
              <span className="text-[10px]" style={{ color: 'var(--bn-text-tertiary)' }}>
                {isToday ? '今天' : ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
              </span>
              <span className="bn-mono text-base mt-0.5">{d.getDate()}</span>
            </button>
          )
        })}
      </div>

      {/* 三餐 slot */}
      <div className="space-y-2">
        {(['breakfast', 'lunch', 'dinner'] as MealSlot[]).map((slot) => (
          <MealSlotRow
            key={slot}
            slot={slot}
            recipes={recipes ?? []}
            recipeId={plan[slot]}
            onChange={(id) => setSlot(slot, id)}
            onEdit={(r) => setEditingRecipe(r)}
          />
        ))}
      </div>

      {feedback && (
        <p className="text-xs text-center" style={{ color: 'var(--bn-positive)' }}>
          {feedback}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={addAllToShopping} variant="glass">
          🛒 把今天所有菜的食材加入购物清单
        </Button>
        <Button onClick={() => setCreating(true)} variant="ghost">
          + 新菜
        </Button>
      </div>
    </div>
  )
}

function MealSlotRow({
  slot,
  recipes,
  recipeId,
  onChange,
  onEdit,
}: {
  slot: MealSlot
  recipes: Recipe[]
  recipeId: string | null
  onChange: (id: string | null) => void
  onEdit: (r: Recipe) => void
}) {
  const [picking, setPicking] = useState(false)
  const recipe = recipes.find((r) => r.id === recipeId)

  return (
    <GlassPanel padding="md" radius="lg">
      <div className="flex items-center gap-3">
        <div className="w-12 shrink-0">
          <p className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--bn-text-tertiary)' }}>
            {SLOT_LABELS[slot]}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          {recipe ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium"
                  style={{ color: 'var(--bn-text-primary)' }}>
                  {recipe.name}
                </p>
                {recipe.description && (
                  <p className="truncate text-[11px]"
                    style={{ color: 'var(--bn-text-tertiary)' }}>
                    {recipe.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onEdit(recipe)}
                className="text-[11px] underline shrink-0"
                style={{ color: 'var(--bn-text-tertiary)' }}
              >
                改菜单
              </button>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-[11px] shrink-0"
                style={{ color: 'var(--bn-text-tertiary)' }}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPicking(!picking)}
              className="text-sm"
              style={{ color: 'var(--bn-text-tertiary)' }}
            >
              + 选一个菜
            </button>
          )}
        </div>
      </div>

      {picking && !recipe && (
        <div className="mt-3 flex flex-wrap gap-1.5"
          style={{ borderTop: '0.5px solid var(--bn-row-border)', paddingTop: '12px' }}>
          {recipes.length === 0 ? (
            <p className="text-[11px]" style={{ color: 'var(--bn-text-tertiary)' }}>
              还没存任何菜。先点底下"+ 新菜"加几个常做的。
            </p>
          ) : recipes.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onChange(r.id)
                setPicking(false)
              }}
              className="rounded-full px-2.5 py-1 text-[11px]"
              style={{
                background: 'var(--bn-glass)',
                color: 'var(--bn-text-primary)',
                border: '0.5px solid var(--bn-glass-border)',
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </GlassPanel>
  )
}

function RecipeEditor({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const isNew = recipe === null
  const [name, setName] = useState(recipe?.name ?? '')
  const [description, setDescription] = useState(recipe?.description ?? '')
  const [items, setItems] = useState<Array<{ ingredient_name: string; quantity: number; unit: string }>>([])
  const [savingId, setSavingId] = useState<string | null>(recipe?.id ?? null)
  const [feedback, setFeedback] = useState<string | null>(null)

  // 加载已有 items
  useState(() => {
    if (recipe) {
      void recipeItemRepo.listByRecipe(recipe.id).then((arr) => {
        setItems(arr.map((i) => ({
          ingredient_name: i.ingredient_name,
          quantity: i.quantity,
          unit: i.unit,
        })))
      })
    } else {
      setItems([{ ingredient_name: '', quantity: 1, unit: 'g' }])
    }
  })

  function addItemRow() {
    setItems([...items, { ingredient_name: '', quantity: 1, unit: 'g' }])
  }
  function updateItem(idx: number, patch: Partial<typeof items[0]>) {
    const next = [...items]
    next[idx] = { ...next[idx]!, ...patch }
    setItems(next)
  }
  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx))
  }

  async function save() {
    if (!name.trim()) return
    let recipeId = savingId
    if (!recipeId) {
      const created = await recipeRepo.create({
        name: name.trim(),
        description: description.trim(),
        servings: 1,
        instructions: '',
        cover_image_url: null,
        tag_ids: [],
      })
      recipeId = created.id
      setSavingId(recipeId)
    } else {
      await recipeRepo.update(recipeId, {
        name: name.trim(),
        description: description.trim(),
      })
    }
    // 全量替换 items
    if (recipe) {
      const old = await recipeItemRepo.listByRecipe(recipe.id)
      for (const o of old) await recipeItemRepo.softDelete(o.id)
    }
    for (const it of items) {
      if (!it.ingredient_name.trim()) continue
      await recipeItemRepo.create({
        recipe_id: recipeId!,
        ingredient_name: it.ingredient_name.trim(),
        quantity: it.quantity,
        unit: it.unit,
      })
    }
    setFeedback('已保存 ✓')
    setTimeout(() => setFeedback(null), 1500)
  }

  async function remove() {
    if (!savingId) {
      onClose()
      return
    }
    if (!confirm('删除这个菜?')) return
    await recipeRepo.softDelete(savingId)
    onClose()
  }

  return (
    <GlassPanel padding="lg" radius="lg" variant="strong">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          {isNew && !savingId ? '新菜' : '编辑菜单'}
        </h2>
        <button type="button" onClick={onClose} className="text-sm"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          ← 返回
        </button>
      </div>

      <Input placeholder="菜名(如:番茄炒蛋)"
        value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} />
      <Input className="mt-2" placeholder="描述(可选,如 5 分钟搞定)"
        value={description} onChange={(e) => setDescription(e.target.value)} />

      <p className="mb-1 mt-4 text-[11px] uppercase tracking-wider"
        style={{ color: 'var(--bn-text-tertiary)' }}>
        食材
      </p>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input placeholder="食材名" value={it.ingredient_name}
              onChange={(e) => updateItem(i, { ingredient_name: e.target.value })}
              className="flex-1" />
            <input type="number" step="0.1" min={0} value={it.quantity}
              onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 0 })}
              className="w-16 rounded-lg px-2 py-1.5 text-sm bn-mono"
              style={{
                background: 'var(--bn-glass)',
                border: '0.5px solid var(--bn-glass-border)',
                color: 'var(--bn-text-primary)',
              }} />
            <select value={it.unit} onChange={(e) => updateItem(i, { unit: e.target.value })}
              className="rounded-lg px-2 py-1.5 text-sm"
              style={{
                background: 'var(--bn-glass)',
                border: '0.5px solid var(--bn-glass-border)',
                color: 'var(--bn-text-primary)',
              }}>
              {['g', 'kg', 'ml', 'L', '个', '勺', '把', '片', ''].map((u) => (
                <option key={u} value={u}>{u || '-'}</option>
              ))}
            </select>
            <button type="button" onClick={() => removeItem(i)}
              className="text-xs" style={{ color: 'var(--bn-text-tertiary)' }}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addItemRow}
        className="mt-2 text-[11px] underline"
        style={{ color: 'var(--bn-text-tertiary)' }}>
        + 加一行
      </button>

      {feedback && (
        <p className="mt-3 text-xs" style={{ color: 'var(--bn-positive)' }}>
          {feedback}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={save} disabled={!name.trim()}>
          {savingId ? '保存修改' : '保存菜单'}
        </Button>
        {savingId && (
          <Button variant="ghost" onClick={remove} className="ml-auto">
            <span style={{ color: 'var(--bn-negative)' }}>删除</span>
          </Button>
        )}
      </div>
    </GlassPanel>
  )
}

void ({} as RecipeItem) // keep import
