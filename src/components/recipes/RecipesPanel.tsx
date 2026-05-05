import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { recipeRepo, recipeItemRepo } from '@/repositories'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { addRecipeToShopping } from '@/lib/kitchen-flow'
import type { Recipe, RecipeItem } from '@/types'

export function RecipesPanel() {
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null)
  const [creating, setCreating] = useState(false)

  const recipes = useLiveQuery(
    () => db.recipes.filter((r) => !r.deleted_at).sortBy('created_at'),
    [],
    [],
  )

  if (creating || activeRecipe) {
    return (
      <RecipeDetail
        recipe={activeRecipe}
        onClose={() => {
          setActiveRecipe(null)
          setCreating(false)
        }}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button onClick={() => setCreating(true)}>+ 新食谱</Button>
      </div>

      {(recipes ?? []).length === 0 ? (
        <GlassPanel padding="lg" radius="lg">
          <p className="py-6 text-center text-sm" style={{ color: 'var(--bn-text-tertiary)' }}>
            还没有食谱,加几个常做的菜吧。
          </p>
        </GlassPanel>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(recipes ?? []).map((r) => (
            <RecipeCard key={r.id} recipe={r} onClick={() => setActiveRecipe(r)} />
          ))}
        </div>
      )}
    </div>
  )
}

function RecipeCard({ recipe, onClick }: { recipe: Recipe; onClick: () => void }) {
  const itemCount = useLiveQuery(
    async () => {
      const items = await recipeItemRepo.listByRecipe(recipe.id)
      return items.length
    },
    [recipe.id],
    0,
  )

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left transition-opacity hover:opacity-90"
    >
      <GlassPanel padding="md" radius="lg">
        <h3 className="text-sm font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          {recipe.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          {recipe.description || '(无描述)'}
        </p>
        <div className="mt-2 flex items-center gap-2 text-[11px]"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          <span>🥄 {itemCount} 配料</span>
          <span>·</span>
          <span>👥 {recipe.servings} 人份</span>
        </div>
      </GlassPanel>
    </button>
  )
}

function RecipeDetail({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const isNew = recipe === null
  const [name, setName] = useState(recipe?.name ?? '')
  const [description, setDescription] = useState(recipe?.description ?? '')
  const [servings, setServings] = useState(recipe?.servings ?? 1)
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '')
  const [items, setItems] = useState<Array<Pick<RecipeItem, 'ingredient_name' | 'quantity' | 'unit'>>>([])
  const [savingId, setSavingId] = useState<string | null>(recipe?.id ?? null)
  const [feedback, setFeedback] = useState<string | null>(null)

  // 加载配料
  useEffect(() => {
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
  }, [recipe])

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
        servings,
        instructions: instructions.trim(),
        cover_image_url: null,
        tag_ids: [],
      })
      recipeId = created.id
      setSavingId(recipeId)
    } else {
      await recipeRepo.update(recipeId, {
        name: name.trim(),
        description: description.trim(),
        servings,
        instructions: instructions.trim(),
      })
    }

    // 全量替换 items:删除老的,创建新的(简化处理)
    if (recipe) {
      const old = await recipeItemRepo.listByRecipe(recipe.id)
      for (const o of old) {
        await recipeItemRepo.softDelete(o.id)
      }
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
    setTimeout(() => setFeedback(null), 2000)
  }

  async function addToShopping() {
    if (!savingId) {
      setFeedback('先保存食谱')
      return
    }
    const r = await addRecipeToShopping(savingId, 1)
    setFeedback(`已加入购物清单:新增 ${r.added},合并 ${r.merged}`)
    setTimeout(() => setFeedback(null), 4000)
  }

  async function remove() {
    if (!savingId) {
      onClose()
      return
    }
    if (!confirm('确认删除这个食谱?')) return
    await recipeRepo.softDelete(savingId)
    onClose()
  }

  return (
    <GlassPanel padding="lg" radius="lg" variant="strong">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          {isNew && !savingId ? '新食谱' : '食谱详情'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm"
          style={{ color: 'var(--bn-text-tertiary)' }}
        >
          ← 返回
        </button>
      </div>

      <Input
        placeholder="菜名"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus={isNew}
      />

      <Input
        className="mt-2"
        placeholder="一句话描述(可选)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="mt-2 flex items-center gap-2 text-xs"
        style={{ color: 'var(--bn-text-secondary)' }}>
        <span>份数</span>
        <input
          type="number"
          min={1}
          value={servings}
          onChange={(e) => setServings(Math.max(1, Number(e.target.value) || 1))}
          className="w-16 rounded-lg px-2 py-1 text-sm bn-mono"
          style={{
            background: 'var(--bn-glass)',
            border: '0.5px solid var(--bn-glass-border)',
            color: 'var(--bn-text-primary)',
          }}
        />
        <span>人份</span>
      </div>

      {/* 配料 */}
      <p className="mb-1 mt-4 text-[11px] uppercase tracking-wider"
        style={{ color: 'var(--bn-text-tertiary)' }}>
        配料
      </p>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              placeholder="食材名"
              value={it.ingredient_name}
              onChange={(e) => updateItem(i, { ingredient_name: e.target.value })}
              className="flex-1"
            />
            <input
              type="number"
              step="0.1"
              min={0}
              value={it.quantity}
              onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 0 })}
              className="w-16 rounded-lg px-2 py-1.5 text-sm bn-mono"
              style={{
                background: 'var(--bn-glass)',
                border: '0.5px solid var(--bn-glass-border)',
                color: 'var(--bn-text-primary)',
              }}
            />
            <select
              value={it.unit}
              onChange={(e) => updateItem(i, { unit: e.target.value })}
              className="rounded-lg px-2 py-1.5 text-sm"
              style={{
                background: 'var(--bn-glass)',
                border: '0.5px solid var(--bn-glass-border)',
                color: 'var(--bn-text-primary)',
              }}
            >
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="L">L</option>
              <option value="个">个</option>
              <option value="勺">勺</option>
              <option value="把">把</option>
              <option value="片">片</option>
              <option value="">无单位</option>
            </select>
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="text-xs"
              style={{ color: 'var(--bn-text-tertiary)' }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addItemRow}
        className="mt-2 text-[11px] underline"
        style={{ color: 'var(--bn-text-tertiary)' }}
      >
        + 加一行配料
      </button>

      {/* 步骤 */}
      <p className="mb-1 mt-4 text-[11px] uppercase tracking-wider"
        style={{ color: 'var(--bn-text-tertiary)' }}>
        步骤
      </p>
      <textarea
        placeholder="一步一行,简单写写"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={6}
        className="w-full rounded-lg p-2.5 text-sm leading-relaxed"
        style={{
          background: 'var(--bn-glass)',
          border: '0.5px solid var(--bn-glass-border)',
          color: 'var(--bn-text-primary)',
          fontFamily: 'inherit',
        }}
      />

      {feedback && (
        <p className="mt-3 text-xs" style={{ color: 'var(--bn-positive)' }}>
          {feedback}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={!name.trim()}>
          {savingId ? '保存修改' : '保存食谱'}
        </Button>
        {savingId && (
          <Button variant="glass" onClick={addToShopping}>
            🛒 加入购物清单
          </Button>
        )}
        {savingId && (
          <Button variant="ghost" onClick={remove} className="ml-auto">
            <span style={{ color: 'var(--bn-negative)' }}>删除</span>
          </Button>
        )}
      </div>
    </GlassPanel>
  )
}

// 保活 lint
void useMemo
