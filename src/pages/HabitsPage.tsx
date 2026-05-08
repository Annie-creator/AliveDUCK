import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { HabitCreator } from '@/components/habits/HabitCard'
import { UnifiedHabitCalendar } from '@/components/habits/UnifiedHabitCalendar'
import { TodayCheckInList } from '@/components/habits/TodayCheckInList'

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
          className="mb-1.5 uppercase"
          style={{
            fontSize: 'var(--bn-text-xs)',
            fontWeight: 500,
            color: 'var(--bn-text-secondary)',
            letterSpacing: '0.08em',
          }}
        >
          HABITS
        </p>
        <h1
          className="leading-[1.15]"
          style={{
            fontSize: 'var(--bn-text-3xl)',
            color: 'var(--bn-text-primary)',
            fontWeight: 600,
            letterSpacing: '-0.03em',
          }}
        >
          习惯
          <span
            className="ml-2"
            style={{
              color: 'var(--bn-text-tertiary)',
              fontWeight: 400,
              fontSize: 'var(--bn-text-lg)',
              letterSpacing: '-0.015em',
            }}
          >
            一格一天,慢慢长
          </span>
        </h1>
      </div>

      <HabitCreator />

      {(habits ?? []).length === 0 ? (
        <GlassPanel padding="lg" radius="lg">
          <p
            className="py-6 text-center"
            style={{ fontSize: 'var(--bn-text-sm)', color: 'var(--bn-text-tertiary)' }}
          >
            还没有习惯,点上面"新建习惯"开始追踪。
          </p>
        </GlassPanel>
      ) : (
        <>
          {/* 顶层:统一月历 — 所有习惯一格 1 天显示完成的 emoji */}
          <UnifiedHabitCalendar habits={habits ?? []} />

          {/* 下层:紧凑今日打卡列表 — 每习惯一行,emoji + +/- + streak */}
          <TodayCheckInList habits={habits ?? []} />
        </>
      )}
    </div>
  )
}
