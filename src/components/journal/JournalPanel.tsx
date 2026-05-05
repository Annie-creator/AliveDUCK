import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { journalRepo } from '@/repositories'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { Journal } from '@/types'

type MoodKey = 'great' | 'good' | 'meh' | 'bad' | 'awful' | 'tired' | 'anxious' | 'happy' | 'thoughtful'

const MOODS: Array<{ key: MoodKey; emoji: string; label: string }> = [
  { key: 'great', emoji: '🌞', label: '很好' },
  { key: 'good', emoji: '🙂', label: '不错' },
  { key: 'meh', emoji: '😐', label: '一般' },
  { key: 'bad', emoji: '🌧', label: '糟糕' },
  { key: 'tired', emoji: '😴', label: '疲惫' },
  { key: 'anxious', emoji: '😰', label: '焦虑' },
  { key: 'happy', emoji: '🌸', label: '开心' },
  { key: 'thoughtful', emoji: '💭', label: '沉思' },
]

/**
 * 日记编辑器 + 列表 + 搜索。
 * Markdown 用最简单的换行 + 段落显示,不引入富文本库(节省 bundle)。
 */
export function JournalPanel() {
  const [editing, setEditing] = useState<Journal | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  const all = useLiveQuery(
    () =>
      db.journals
        .filter((j) => !j.deleted_at)
        .reverse()
        .sortBy('created_at'),
    [],
    [],
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return all ?? []
    const q = search.toLowerCase()
    return (all ?? []).filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.content.toLowerCase().includes(q),
    )
  }, [all, search])

  if (editing || creating) {
    return (
      <JournalEditor
        initial={editing}
        onClose={() => {
          setEditing(null)
          setCreating(false)
        }}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="搜索日记…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Button onClick={() => setCreating(true)}>+ 新条目</Button>
      </div>

      {filtered.length === 0 && (
        <GlassPanel padding="lg" radius="lg">
          <p className="py-6 text-center text-sm" style={{ color: 'var(--bn-text-tertiary)' }}>
            {search ? '没有匹配的日记' : '还没有日记,记下今天的一件小事吧。'}
          </p>
        </GlassPanel>
      )}

      <div className="space-y-2">
        {filtered.map((j) => (
          <JournalCard key={j.id} journal={j} onClick={() => setEditing(j)} />
        ))}
      </div>
    </div>
  )
}

function JournalCard({ journal, onClick }: { journal: Journal; onClick: () => void }) {
  const mood = MOODS.find((m) => m.key === journal.mood)
  const date = new Date(journal.created_at)
  const preview = journal.content.split('\n').filter((l) => l.trim()).slice(0, 2).join(' · ')

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left transition-all hover:opacity-90"
    >
      <GlassPanel padding="md" radius="lg">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{mood?.emoji ?? '📝'}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h3
                className="truncate text-sm font-medium"
                style={{ color: 'var(--bn-text-primary)' }}
              >
                {journal.title || '(无题)'}
              </h3>
              <span
                className="bn-mono shrink-0 text-[11px]"
                style={{ color: 'var(--bn-text-tertiary)' }}
              >
                {date.toLocaleDateString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                })}
              </span>
            </div>
            {preview && (
              <p
                className="mt-1 line-clamp-2 text-xs"
                style={{ color: 'var(--bn-text-tertiary)' }}
              >
                {preview}
              </p>
            )}
          </div>
        </div>
      </GlassPanel>
    </button>
  )
}

function JournalEditor({
  initial,
  onClose,
}: {
  initial: Journal | null
  onClose: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [mood, setMood] = useState<MoodKey | null>(
    (initial?.mood as MoodKey | null) ?? null,
  )
  const [saving, setSaving] = useState(false)

  const isNew = !initial

  async function save() {
    setSaving(true)
    try {
      if (isNew) {
        await journalRepo.create({
          title: title.trim(),
          content: content.trim(),
          image_urls: [],
          mood,
          tag_ids: [],
        })
      } else {
        await journalRepo.update(initial!.id, {
          title: title.trim(),
          content: content.trim(),
          mood,
        })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!initial) return
    if (!confirm('确认删除这条日记?')) return
    await journalRepo.softDelete(initial.id)
    onClose()
  }

  return (
    <GlassPanel padding="lg" radius="lg" variant="strong">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          {isNew ? '新日记' : '编辑日记'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm"
          style={{ color: 'var(--bn-text-tertiary)' }}
        >
          ✕
        </button>
      </div>

      <Input
        placeholder="标题(可空)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus={isNew}
      />

      <textarea
        placeholder="今天发生了什么?"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={10}
        className="mt-2 w-full resize-y rounded-lg p-3 text-sm leading-relaxed"
        style={{
          background: 'var(--bn-glass)',
          border: '0.5px solid var(--bn-glass-border)',
          color: 'var(--bn-text-primary)',
          fontFamily: 'inherit',
        }}
      />

      <div className="mt-3">
        <p className="mb-1.5 text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          心情
        </p>
        <div className="flex flex-wrap gap-1.5">
          {MOODS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMood(mood === m.key ? null : m.key)}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-all"
              style={{
                background: mood === m.key ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                color: mood === m.key ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
                border: `0.5px solid ${mood === m.key ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
              }}
            >
              <span>{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={save} disabled={saving || (!title.trim() && !content.trim())}>
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        {!isNew && (
          <Button variant="ghost" onClick={remove} className="ml-auto">
            <span style={{ color: 'var(--bn-negative)' }}>删除</span>
          </Button>
        )}
      </div>
    </GlassPanel>
  )
}
