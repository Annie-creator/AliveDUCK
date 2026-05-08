import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2, Clock, Check, X, ChefHat } from 'lucide-react'
import { db } from '@/db'
import { recipeRepo, recipeItemRepo } from '@/repositories'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { MEAL_TYPES, type MealType, type Recipe, type RecipeItem } from '@/types'
import {
  checkAvailability,
  filterRecipesByMealType,
  filterRecipesByDuration,
} from '@/lib/recipe-availability'

/**
 * Phase D-2: 菜单模块。
 *
 * 列出所有菜,支持按餐次/时长筛选,点击进入编辑器修改食材。
 * 同时显示根据当前库存的可制作状态（绿:全有 · 黄:缺一些 · 灰:缺料）。
 */
export function RecipeMenuPanel() {
  const [filterMeal, setFilterMeal] = useState<MealType | null>(null)
  const [filterDuration, setFilterDuration] = useState<number | null>(null)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [creating, setCreating] = useState(false)

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

  // 按 recipe_id 索引食材
  const itemsByRecipe = useMemo(() => {
    const m = new Map<string, RecipeItem[]>()
    for (const it of allItems ?? []) {
      const arr = m.get(it.recipe_id) ?? []
      arr.push(it)
      m.set(it.recipe_id, arr)
    }
    return m
  }, [allItems])

  // 应用筛选
  const filtered = useMemo(() => {
    let list = recipes ?? []
    list = filterRecipesByMealType(list, filterMeal)
    list = filterRecipesByDuration(list, filterDuration)
    return list
  }, [recipes, filterMeal, filterDuration])

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <GlassPanel padding="md" radius="lg">
        <div className="space-y-2">
          <FilterRow label="餐次">
            <FilterChip active={filterMeal === null} onClick={() => setFilterMeal(null)}>
              全部
            </FilterChip>
            {MEAL_TYPES.map((m) => (
              <FilterChip
                key={m}
                active={filterMeal === m}
                onClick={() => setFilterMeal(filterMeal === m ? null : m)}
              >
                {m}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="时长">
            <FilterChip active={filterDuration === null} onClick={() => setFilterDuration(null)}>
              不限
            </FilterChip>
            {[15, 30, 45, 60].map((mins) => (
              <FilterChip
                key={mins}
                active={filterDuration === mins}
                onClick={() => setFilterDuration(filterDuration === mins ? null : mins)}
              >
                ≤ {mins} 分钟
              </FilterChip>
            ))}
          </FilterRow>
        </div>
      </GlassPanel>

      {/* 菜单列表 */}
      <div className="flex items-center justify-between">
        <h3 style={{ fontSize: 'var(--bn-text-sm)', color: 'var(--bn-text-secondary)' }}>
          {filtered.length} 道菜
          {(filterMeal || filterDuration !== null) && (
            <span style={{ color: 'var(--bn-text-tertiary)', marginLeft: 6 }}>
              · 已筛选
            </span>
          )}
        </h3>
        <Button variant="glass" onClick={() => setCreating(true)}>
          + 新建菜
        </Button>
      </div>

      {filtered.length === 0 ? (
        <GlassPanel padding="lg" radius="lg">
          <p
            className="py-6 text-center"
            style={{ fontSize: 'var(--bn-text-sm)', color: 'var(--bn-text-tertiary)' }}
          >
            {(recipes ?? []).length === 0
              ? '还没有菜,点上面"新建菜"开始添加。'
              : '没有符合筛选条件的菜。'}
          </p>
        </GlassPanel>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((r) => (
            <RecipeRow
              key={r.id}
              recipe={r}
              items={itemsByRecipe.get(r.id) ?? []}
              pantry={pantry ?? []}
              onEdit={() => setEditingRecipe(r)}
            />
          ))}
        </div>
      )}

      {/* 编辑/新建对话 */}
      {(creating || editingRecipe) && (
        <RecipeEditor
          recipe={editingRecipe}
          onClose={() => {
            setCreating(false)
            setEditingRecipe(null)
          }}
        />
      )}
    </div>
  )
}

/* ── 单行菜卡片 ──────────────────────────────────── */
function RecipeRow({
  recipe,
  items,
  pantry,
  onEdit,
}: {
  recipe: Recipe
  items: RecipeItem[]
  pantry: import('@/types').PantryItem[]
  onEdit: () => void
}) {
  const avail = items.length > 0 ? checkAvailability(items, pantry) : null

  const statusColor =
    avail?.status === 'sufficient'
      ? 'var(--bn-positive)'
      : avail?.status === 'partial'
        ? '#E0A75F'
        : 'var(--bn-text-tertiary)'
  const statusLabel =
    avail === null
      ? '未填食材'
      : avail.status === 'sufficient'
        ? `可制作 (${avail.totalCount} 样齐)`
        : avail.status === 'partial'
          ? `缺 ${avail.totalCount - avail.haveCount} 样`
          : `缺 ${avail.totalCount} 样`

  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full rounded-xl px-3 py-2.5 text-left transition-all hover:scale-[1.01]"
      style={{
        background: 'var(--bn-glass)',
        border: '0.5px solid var(--bn-glass-border)',
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="truncate"
          style={{
            fontSize: 'var(--bn-text-md)',
            fontWeight: 600,
            color: 'var(--bn-text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          {recipe.name}
        </span>
        <span
          className="bn-mono shrink-0"
          style={{ fontSize: 'var(--bn-text-xs)', color: 'var(--bn-text-tertiary)' }}
        >
          <Clock
            size={10}
            strokeWidth={2}
            style={{ display: 'inline-block', verticalAlign: -1, marginRight: 2 }}
          />
          {recipe.duration_minutes} 分
        </span>
      </div>
      <div
        className="mt-1 flex flex-wrap items-center gap-1"
        style={{ fontSize: 'var(--bn-text-xs)' }}
      >
        {recipe.meal_types.length === 0 ? (
          <span style={{ color: 'var(--bn-text-tertiary)', fontStyle: 'italic' }}>
            未标餐次
          </span>
        ) : (
          recipe.meal_types.map((m) => (
            <span
              key={m}
              className="rounded-full px-1.5"
              style={{
                background: 'var(--bn-glass-strong)',
                color: 'var(--bn-text-secondary)',
                fontSize: 10,
              }}
            >
              {m}
            </span>
          ))
        )}
      </div>
      <div
        className="mt-1.5 flex items-center gap-1.5"
        style={{ fontSize: 'var(--bn-text-xs)' }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusColor,
          }}
        />
        <span style={{ color: statusColor }}>{statusLabel}</span>
      </div>
    </button>
  )
}

/* ── 菜编辑器(对话) ─────────────────────────────── */
function RecipeEditor({
  recipe,
  onClose,
}: {
  recipe: Recipe | null
  onClose: () => void
}) {
  const isNew = !recipe

  const [name, setName] = useState(recipe?.name ?? '')
  const [duration, setDuration] = useState(recipe?.duration_minutes ?? 30)
  const [mealTypes, setMealTypes] = useState<MealType[]>(recipe?.meal_types ?? [])
  const [items, setItems] = useState<Array<{ name: string; quantity: number; unit: string }>>([])
  const [loadingItems, setLoadingItems] = useState(!isNew)

  // 加载已有食材
  useMemo(() => {
    if (!recipe) return
    void db.recipe_items
      .where('recipe_id')
      .equals(recipe.id)
      .filter((i) => !i.deleted_at)
      .toArray()
      .then((arr) => {
        setItems(
          arr.map((i) => ({
            name: i.ingredient_name,
            quantity: i.quantity,
            unit: i.unit,
          })),
        )
        setLoadingItems(false)
      })
  }, [recipe])

  function toggleMeal(m: MealType) {
    setMealTypes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  }
  function addItem() {
    setItems([...items, { name: '', quantity: 1, unit: '' }])
  }
  function updateItem(idx: number, patch: Partial<{ name: string; quantity: number; unit: string }>) {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx))
  }

  async function save() {
    if (!name.trim()) return
    let recipeId = recipe?.id
    if (recipeId) {
      await recipeRepo.update(recipeId, {
        name: name.trim(),
        duration_minutes: duration,
        meal_types: mealTypes,
      })
      // 全量替换食材
      const old = await db.recipe_items
        .where('recipe_id')
        .equals(recipeId)
        .filter((i) => !i.deleted_at)
        .toArray()
      for (const o of old) await recipeItemRepo.softDelete(o.id)
    } else {
      const created = await recipeRepo.create({
        name: name.trim(),
        description: '',
        servings: 1,
        instructions: '',
        cover_image_url: null,
        tag_ids: [],
        meal_types: mealTypes,
        duration_minutes: duration,
      })
      recipeId = created.id
    }
    for (const it of items) {
      if (!it.name.trim()) continue
      await recipeItemRepo.create({
        recipe_id: recipeId!,
        ingredient_name: it.name.trim(),
        quantity: it.quantity,
        unit: it.unit.trim(),
      })
    }
    onClose()
  }

  async function remove() {
    if (!recipe) return
    if (!confirm(`删除 "${recipe.name}"?`)) return
    await recipeRepo.softDelete(recipe.id)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-5"
        style={{
          background: 'var(--bn-bg)',
          border: '0.5px solid var(--bn-glass-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2
            className="flex items-center gap-2"
            style={{
              fontSize: 'var(--bn-text-lg)',
              fontWeight: 600,
              color: 'var(--bn-text-primary)',
            }}
          >
            <ChefHat size={18} strokeWidth={2} />
            {isNew ? '新建菜' : recipe?.name}
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

        <Input
          placeholder="菜名(如:番茄炒蛋)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <div className="mt-3">
          <p
            className="mb-1.5 uppercase"
            style={{
              fontSize: 'var(--bn-text-xs)',
              color: 'var(--bn-text-tertiary)',
              letterSpacing: '0.06em',
            }}
          >
            适合的餐次(可多选)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MEAL_TYPES.map((m) => (
              <FilterChip key={m} active={mealTypes.includes(m)} onClick={() => toggleMeal(m)}>
                {m}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <p
            className="mb-1.5 uppercase"
            style={{
              fontSize: 'var(--bn-text-xs)',
              color: 'var(--bn-text-tertiary)',
              letterSpacing: '0.06em',
            }}
          >
            烹饪时长(分钟)
          </p>
          <input
            type="number"
            min={1}
            max={300}
            value={duration}
            onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 30))}
            className="bn-mono w-24 rounded-lg px-2.5 py-1.5"
            style={{
              fontSize: 'var(--bn-text-sm)',
              background: 'var(--bn-glass)',
              border: '0.5px solid var(--bn-glass-border)',
              color: 'var(--bn-text-primary)',
            }}
          />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <p
              className="uppercase"
              style={{
                fontSize: 'var(--bn-text-xs)',
                color: 'var(--bn-text-tertiary)',
                letterSpacing: '0.06em',
              }}
            >
              食材
            </p>
            <button
              type="button"
              onClick={addItem}
              className="rounded-md px-2 py-0.5 hover:bg-white/5"
              style={{
                fontSize: 'var(--bn-text-xs)',
                color: 'var(--bn-accent)',
              }}
            >
              + 加一项
            </button>
          </div>
          {loadingItems ? (
            <p style={{ fontSize: 'var(--bn-text-sm)', color: 'var(--bn-text-tertiary)' }}>
              加载中…
            </p>
          ) : items.length === 0 ? (
            <p style={{ fontSize: 'var(--bn-text-sm)', color: 'var(--bn-text-tertiary)' }}>
              （暂无,点上方"加一项"添加）
            </p>
          ) : (
            <div className="space-y-1.5">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    placeholder="食材名"
                    value={it.name}
                    onChange={(e) => updateItem(i, { name: e.target.value })}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={it.quantity}
                    onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 0 })}
                    className="bn-mono w-16 rounded-lg px-2 py-1 text-sm"
                    style={{
                      background: 'var(--bn-glass)',
                      border: '0.5px solid var(--bn-glass-border)',
                      color: 'var(--bn-text-primary)',
                    }}
                  />
                  <Input
                    placeholder="单位"
                    value={it.unit}
                    onChange={(e) => updateItem(i, { unit: e.target.value })}
                    className="w-16"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-white/10"
                    style={{ color: 'var(--bn-text-tertiary)' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <Button onClick={save} disabled={!name.trim()}>
            <Check size={14} strokeWidth={2.4} style={{ marginRight: 4 }} />
            保存
          </Button>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          {!isNew && (
            <Button variant="ghost" onClick={remove} className="ml-auto">
              <span style={{ color: 'var(--bn-negative)' }}>
                <Trash2 size={12} strokeWidth={2} style={{ marginRight: 3, verticalAlign: -1 }} />
                删除
              </span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── 小型 UI 工具 ────────────────────────────────── */
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
