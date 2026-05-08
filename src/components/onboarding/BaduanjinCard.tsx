import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, Check, Clock } from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import {
  useBaduanjinStats,
  markBaduanjinDone,
  dismissBaduanjinToday,
  getTodayMove,
} from '@/lib/baduanjin'

/**
 * 八段锦卡片 —— 早晨 8-10 点弹出。
 *
 * 关键设计决策（讨论方案里已确认）：
 *  - 每天只显示 1 个动作（按周一→周日循环），不强迫做完 8 式
 *  - "现在开始"按钮 → 跳转 bilibili 12 分钟模式（国家体育总局演示版）
 *  - "稍后再说" → 今日不再弹
 *  - 完成后卡片折叠成一行 streak 提示
 *  - 累计完成次数 + 当前连续天数
 *
 * 显示规则：
 *  - 8:00-10:00 之间打开 app
 *  - 今日未完成、未跳过
 *  - 在其它时间也可以从设置或习惯页手动调出（暂未实现，后续）
 */

const BADUANJIN_BVID = 'BV1gT4y1m7ec'
const BADUANJIN_URL = `https://www.bilibili.com/video/${BADUANJIN_BVID}`

interface Props {
  /** 强制显示（用于设置页预览） */
  forceShow?: boolean
}

export function BaduanjinCard({ forceShow = false }: Props) {
  const stats = useBaduanjinStats()

  const hour = new Date().getHours()
  const inWindow = hour >= 8 && hour < 10

  // 今天已完成 → 显示 streak 折叠卡
  if (stats.completedToday && !forceShow) {
    return <BaduanjinDoneStrip streak={stats.streak} total={stats.totalCompleted} />
  }

  // 不在时间窗口 / 已跳过 / 不强制 → 不显示
  if (!forceShow && (!inWindow || stats.dismissedToday)) {
    return null
  }

  const move = getTodayMove()

  function handleStart() {
    // 立刻标记完成 —— 用户点了"现在开始"就算今天有意识在做
    markBaduanjinDone()
    // 跳转 bilibili
    window.open(BADUANJIN_URL, '_blank', 'noopener,noreferrer')
  }

  function handleDismiss() {
    dismissBaduanjinToday()
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginTop: 0 }}
        transition={{ duration: 0.3 }}
      >
        <GlassPanel padding="lg" radius="lg" variant="strong">
          <div className="flex items-start gap-4">
            {/* 太阳 emoji */}
            <motion.div
              animate={{ rotate: [0, 8, 0, -8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                fontSize: 36,
                flexShrink: 0,
                lineHeight: 1,
                marginTop: 2,
              }}
              aria-hidden
            >
              🌅
            </motion.div>

            <div className="min-w-0 flex-1">
              <p
                className="uppercase"
                style={{
                  fontSize: 'var(--bn-text-xs)',
                  color: 'var(--bn-text-tertiary)',
                  letterSpacing: '0.08em',
                  fontWeight: 500,
                }}
              >
                今日八段锦 · 第 {move.index} 式
              </p>
              <h3
                style={{
                  marginTop: 4,
                  fontSize: 'var(--bn-text-xl)',
                  color: 'var(--bn-text-primary)',
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.25,
                }}
              >
                {move.name}
              </h3>
              <p
                style={{
                  marginTop: 4,
                  fontSize: 'var(--bn-text-sm)',
                  color: 'var(--bn-text-secondary)',
                  letterSpacing: '-0.005em',
                }}
              >
                {move.benefit}
              </p>

              {/* 复刻老 HTML 的"身体是革命的本钱"金句 */}
              <p
                style={{
                  marginTop: 10,
                  fontSize: 'var(--bn-text-sm)',
                  color: 'var(--bn-text-tertiary)',
                  fontStyle: 'italic',
                  letterSpacing: '-0.005em',
                }}
              >
                身体是革命的本钱,先来活动一下筋骨吧 ✨
              </p>

              {/* 按钮组 */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleStart}
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2 transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{
                    background: 'var(--bn-button-bg)',
                    color: 'var(--bn-button-fg)',
                    fontSize: 'var(--bn-text-sm)',
                    fontWeight: 500,
                  }}
                >
                  <Clock size={14} strokeWidth={2} />
                  <span>现在开始 · 12 分钟</span>
                  <ExternalLink size={12} strokeWidth={2} style={{ opacity: 0.7 }} />
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-xl px-3 py-2 transition-colors hover:bg-white/10"
                  style={{
                    color: 'var(--bn-text-tertiary)',
                    fontSize: 'var(--bn-text-sm)',
                    border: '0.5px solid var(--bn-glass-border)',
                  }}
                >
                  稍后再说
                </button>
              </div>

              {/* 累计提示（如果有） */}
              {stats.totalCompleted > 0 && (
                <p
                  className="bn-mono"
                  style={{
                    marginTop: 12,
                    fontSize: 'var(--bn-text-xs)',
                    color: 'var(--bn-text-tertiary)',
                    fontWeight: 500,
                  }}
                >
                  已累计完成 {stats.totalCompleted} 天
                  {stats.streak > 1 && ` · 连续 ${stats.streak} 天 🔥`}
                </p>
              )}
            </div>
          </div>
        </GlassPanel>
      </motion.div>
    </AnimatePresence>
  )
}

/* ── 已完成今日 → 折叠成一条 ──────────────────────── */
function BaduanjinDoneStrip({ streak, total }: { streak: number; total: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className="flex items-center gap-2.5 rounded-xl px-4 py-2.5"
        style={{
          background: 'var(--bn-glass)',
          border: '0.5px solid var(--bn-glass-border)',
        }}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'var(--bn-positive)', color: '#fff' }}
        >
          <Check size={14} strokeWidth={3} />
        </span>
        <span
          style={{
            fontSize: 'var(--bn-text-sm)',
            color: 'var(--bn-text-secondary)',
            letterSpacing: '-0.005em',
          }}
        >
          今日八段锦已完成
        </span>
        <span
          className="bn-mono ml-auto"
          style={{
            fontSize: 'var(--bn-text-xs)',
            color: 'var(--bn-text-tertiary)',
            fontWeight: 500,
          }}
        >
          {streak > 1 ? `连续 ${streak} 天 · ` : ''}累计 {total}
        </span>
      </div>
    </motion.div>
  )
}
