import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { HabitCard, HabitCreator } from '@/components/habits/HabitCard'

export function HabitsPage() {
  const habits = useLiveQuery(
    () => db.habits.filter((h) => !h.deleted_at && !h.archived).sortBy('created_at'),
    [],
    [],
  )

  return (
    <div className="space-y-5">
      <div>
        <p
          className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: 'var(--bn-text-secondary)' }}
        >
          HABITS
        </p>
        <h1
          className="text-[30px] leading-[1.15]"
          style={{
            color: 'var(--bn-text-primary)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
          }}
        >
          习惯
          <span
            className="ml-2"
            style={{
              color: 'var(--bn-text-tertiary)',
              fontWeight: 300,
              letterSpacing: '-0.02em',
            }}
          >
            一天一格,慢慢长
          </span>
        </h1>
      </div>

      <HabitCreator />

      {(habits ?? []).length === 0 ? (
        <GlassPanel padding="lg" radius="lg">
          <p className="py-6 text-center text-sm" style={{ color: 'var(--bn-text-tertiary)' }}>
            还没有习惯,点上面"新建习惯"开始追踪。
          </p>
        </GlassPanel>
      ) : (
        <div className="space-y-3">
          {(habits ?? []).map((h) => (
            <HabitCard key={h.id} habit={h} />
          ))}
        </div>
      )}
    </div>
  )
}
