import { motion } from 'framer-motion'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useAuth } from '@/auth/AuthProvider'

/**
 * 时间问候卡 —— 放在 Dashboard 顶部。
 *
 * 5 个时段：
 *   05-10  早安  ☕   杯口轻烟（CSS keyframes 漂浮）
 *   10-14  午好  ☀️   太阳缓慢自转
 *   14-18  下午好 🌤️  云朵漂动
 *   18-22  晚上好 🌙  月光呼吸
 *   22-05  夜深了 ✨  星星闪烁
 */

interface Slot {
  greet: string
  emoji: string
  /** 微动画类型 */
  motion: 'float' | 'spin' | 'drift' | 'breath' | 'twinkle'
  /** 副文案 */
  hint: string
}

function pickSlot(hour: number, name: string): Slot {
  const tag = name ? `, ${name}` : ''
  if (hour >= 5 && hour < 10) {
    return {
      greet: `早安${tag}`,
      emoji: '☕',
      motion: 'float',
      hint: '今天又是 alive 的一天',
    }
  }
  if (hour >= 10 && hour < 14) {
    return {
      greet: `午好${tag}`,
      emoji: '☀️',
      motion: 'spin',
      hint: '吃饱了再继续',
    }
  }
  if (hour >= 14 && hour < 18) {
    return {
      greet: `下午好${tag}`,
      emoji: '🌤️',
      motion: 'drift',
      hint: '一杯咖啡冲过下午',
    }
  }
  if (hour >= 18 && hour < 22) {
    return {
      greet: `晚上好${tag}`,
      emoji: '🌙',
      motion: 'breath',
      hint: '今天辛苦啦',
    }
  }
  return {
    greet: `夜深了${tag}`,
    emoji: '✨',
    motion: 'twinkle',
    hint: '早点睡呀',
  }
}

function todayLabel(): string {
  const d = new Date()
  return d.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

function daysAbroad(): number | null {
  try {
    const raw = localStorage.getItem('banya_arrival_date')
    if (!raw) return null
    const arrival = new Date(raw)
    if (Number.isNaN(arrival.getTime())) return null
    const days = Math.floor((Date.now() - arrival.getTime()) / 86_400_000) + 1
    return days > 0 ? days : null
  } catch {
    return null
  }
}

export function GreetingCard() {
  const { user } = useAuth()
  const name = user?.email?.split('@')[0] ?? ''
  const hour = new Date().getHours()
  const slot = pickSlot(hour, name)
  const days = daysAbroad()

  return (
    <GlassPanel padding="lg" radius="lg" variant="default">
      <div className="flex items-center gap-4">
        {/* 大 emoji + 微动画 */}
        <AnimatedEmoji emoji={slot.emoji} type={slot.motion} />

        {/* 文案 */}
        <div className="min-w-0 flex-1">
          <h2
            style={{
              fontSize: 'var(--bn-text-xl)',
              fontWeight: 600,
              color: 'var(--bn-text-primary)',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            {slot.greet}
          </h2>
          <p
            style={{
              marginTop: 4,
              fontSize: 'var(--bn-text-sm)',
              color: 'var(--bn-text-tertiary)',
              letterSpacing: '-0.005em',
            }}
          >
            {slot.hint}
          </p>
        </div>

        {/* 右侧副信息：日期 + 留学天数 */}
        <div className="hidden text-right sm:block">
          <p
            style={{
              fontSize: 'var(--bn-text-xs)',
              color: 'var(--bn-text-tertiary)',
              letterSpacing: '0.02em',
            }}
          >
            {todayLabel()}
          </p>
          {days !== null && (
            <p
              className="bn-mono"
              style={{
                marginTop: 2,
                fontSize: 'var(--bn-text-sm)',
                color: 'var(--bn-text-secondary)',
                fontWeight: 600,
              }}
            >
              留学 D{days}
            </p>
          )}
        </div>
      </div>
    </GlassPanel>
  )
}

/* ── 大 emoji + 微动画 ────────────────────────────────── */
function AnimatedEmoji({
  emoji,
  type,
}: {
  emoji: string
  type: 'float' | 'spin' | 'drift' | 'breath' | 'twinkle'
}) {
  const variants: Record<string, Parameters<typeof motion.span>[0]> = {
    float: {
      animate: { y: [0, -3, 0] },
      transition: { duration: 3.6, repeat: Infinity, ease: 'easeInOut' },
    },
    spin: {
      animate: { rotate: [0, 360] },
      transition: { duration: 16, repeat: Infinity, ease: 'linear' },
    },
    drift: {
      animate: { x: [0, 4, 0, -4, 0] },
      transition: { duration: 7, repeat: Infinity, ease: 'easeInOut' },
    },
    breath: {
      animate: { scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] },
      transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
    },
    twinkle: {
      animate: { opacity: [1, 0.55, 1], scale: [1, 1.1, 1] },
      transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
    },
  }

  const cfg = variants[type]

  return (
    <motion.span
      {...cfg}
      style={{
        fontSize: 38,
        display: 'inline-block',
        lineHeight: 1,
        flexShrink: 0,
      }}
      aria-hidden
    >
      {emoji}
    </motion.span>
  )
}
