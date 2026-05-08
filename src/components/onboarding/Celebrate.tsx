import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * 完成动画统一语言 —— 全 app 复用一套庆祝动作。
 *
 * 三档强度：
 *   L1 (轻)：按钮内嵌对勾 + 0.3s 缩放回弹 → 用于"加交易""加事件"等小动作
 *   L2 (中)：12 粒子从触发点向外散 + 中央对勾 → 用于"习惯打卡""完成事项"
 *   L3 (重)：全屏遮罩 + 大对勾 + 24 粒子 + 文案 → 用于"番茄钟完成""日记保存"
 *
 * 用法：
 *   const [celebrating, setCelebrating] = useState(false)
 *   <Celebrate level={2} trigger={celebrating} onDone={() => setCelebrating(false)} />
 *   ...
 *   onClick={() => { saveData(); setCelebrating(true); }}
 *
 *   或者用一行 imperative API:
 *   import { fireCelebrate } from '@/components/onboarding/Celebrate'
 *   await saveData(); fireCelebrate(2)
 */

export type CelebrateLevel = 1 | 2 | 3

interface CelebrateProps {
  /** 触发：从 false → true 时播放一次 */
  trigger: boolean
  /** 强度档位 */
  level: CelebrateLevel
  /** 自定义文案（仅 L3 显示） */
  message?: string
  /** 动画完成回调 */
  onDone?: () => void
}

const DURATIONS: Record<CelebrateLevel, number> = {
  1: 350,
  2: 700,
  3: 1300,
}

const PARTICLE_COUNTS: Record<CelebrateLevel, number> = {
  1: 0,
  2: 12,
  3: 24,
}

/**
 * Hook 行为：trigger 从 false 变 true 时播一次，再变 false 不会重播。
 * 调用方负责把 trigger 推回 false（在 onDone 里）。
 */
export function Celebrate({ trigger, level, message, onDone }: CelebrateProps) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!trigger) return
    setActive(true)
    const t = setTimeout(() => {
      setActive(false)
      onDone?.()
    }, DURATIONS[level])
    return () => clearTimeout(t)
  }, [trigger, level, onDone])

  if (!active) return null

  if (level === 1) return <CelebrateL1 />
  if (level === 2) return <CelebrateL2 />
  return <CelebrateL3 message={message} />
}

/* ── L1：按钮内嵌（占位的，实际由调用方在按钮内部用） ─ */
function CelebrateL1() {
  return (
    <motion.span
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full"
      style={{ background: 'var(--bn-positive)', color: '#fff' }}
      aria-hidden
    >
      <Check size={12} strokeWidth={3} />
    </motion.span>
  )
}

/* ── L2：定位元素相对触发处弹出对勾 + 粒子 ────────── */
function CelebrateL2() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
      aria-hidden
    >
      <Particles count={PARTICLE_COUNTS[2]} radius={120} />
      <motion.div
        initial={{ scale: 0, rotate: -180, opacity: 0 }}
        animate={{ scale: [0, 1.2, 1], rotate: 0, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{
          scale: { times: [0, 0.7, 1], duration: 0.5 },
          rotate: { duration: 0.4, ease: 'easeOut' },
          opacity: { duration: 0.2 },
        }}
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{
          background: 'var(--bn-positive)',
          color: '#fff',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
      >
        <Check size={32} strokeWidth={3} />
      </motion.div>
    </div>
  )
}

/* ── L3：全屏遮罩 + 巨型对勾 + 大量粒子 + 文案 ────── */
function CelebrateL3({ message }: { message?: string }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center"
        style={{
          background: 'rgba(0,0,0,0.32)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        aria-hidden
      >
        <Particles count={PARTICLE_COUNTS[3]} radius={220} />

        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: [0, 1.25, 1], rotate: 0 }}
          transition={{
            scale: { times: [0, 0.6, 1], duration: 0.6 },
            rotate: { duration: 0.5, ease: 'easeOut' },
          }}
          className="flex h-24 w-24 items-center justify-center rounded-full"
          style={{
            background: 'var(--bn-positive)',
            color: '#fff',
            boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          }}
        >
          <Check size={48} strokeWidth={3} />
        </motion.div>

        {message && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            style={{
              marginTop: 24,
              fontSize: 'var(--bn-text-xl)',
              color: '#fff',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              textShadow: '0 2px 12px rgba(0,0,0,0.3)',
              padding: '0 24px',
              textAlign: 'center',
            }}
          >
            {message}
          </motion.p>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

/* ── 彩带粒子层 ───────────────────────────────────────
 *  从中心爆出彩色长条纸,飞出后受重力下落,边飞边自旋。
 *  比单纯的圆点更有"炸彩带"的庆祝感（参考老 HTML 的灵魂细节）。
 */
function Particles({ count, radius }: { count: number; radius: number }) {
  // 鲜艳的彩带配色 —— 偏暖橙+粉+蓝紫,呼应"地铁狂欢"主题
  const colors = [
    '#FF9500', // 橙
    '#FF2D92', // 粉红
    '#AF52DE', // 紫
    '#5AC8FA', // 天蓝
    '#34C759', // 草绿
    '#FFD60A', // 金黄
  ]

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {Array.from({ length: count }).map((_, i) => {
        // 每条彩带随机参数
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4
        const dist = radius * (0.7 + Math.random() * 0.6)
        const xMid = Math.cos(angle) * dist * 0.6
        const yMid = Math.sin(angle) * dist * 0.6 - radius * 0.1 // 中段稍微往上,模拟初速度
        const xEnd = Math.cos(angle) * dist
        const yEnd = Math.sin(angle) * dist + radius * 0.8 // 末端落下来(重力)
        const length = 10 + Math.random() * 14 // 8-22px 长度
        const width = 3 + Math.random() * 2 // 3-5px 宽度
        const color = colors[i % colors.length]
        // 初始旋转角度(垂直于飞行方向,这样飞出去时是"立着的")
        const initialRot = (angle * 180) / Math.PI + 90
        const spinTotal = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540)
        const delay = Math.random() * 0.08
        const duration = 0.85 + Math.random() * 0.35

        return (
          <motion.span
            key={i}
            initial={{
              x: 0,
              y: 0,
              rotate: initialRot,
              scale: 0,
              opacity: 1,
            }}
            animate={{
              x: [0, xMid, xEnd],
              y: [0, yMid, yEnd],
              rotate: [initialRot, initialRot + spinTotal * 0.4, initialRot + spinTotal],
              scale: [0, 1, 1],
              opacity: [1, 1, 0],
            }}
            transition={{
              duration,
              ease: [0.2, 0.7, 0.5, 1], // 类抛物线缓动:出发快、落下慢
              delay,
              times: [0, 0.45, 1],
            }}
            style={{
              position: 'absolute',
              width,
              height: length,
              borderRadius: width / 2, // 圆角端点像真彩带
              background: color,
              transformOrigin: 'center center',
              // 加点微微的内阴影模拟纸张的弯折感
              boxShadow: `inset 0 0 0 1px ${color}, 0 1px 2px rgba(0,0,0,0.12)`,
            }}
          />
        )
      })}
    </div>
  )
}

/* ── 命令式 API：fireCelebrate(2)，全 app 任意点触发 ─ */
let dispatch: ((level: CelebrateLevel, message?: string) => void) | null = null

export function fireCelebrate(level: CelebrateLevel, message?: string): void {
  dispatch?.(level, message)
}

interface CelebrateState {
  level: CelebrateLevel
  message?: string
  key: number
}

/** 全局挂载点 —— 在 App 顶层放一个 <CelebrateHost />，然后任意位置 fireCelebrate() */
export function CelebrateHost() {
  const [state, setState] = useState<CelebrateState | null>(null)

  useEffect(() => {
    dispatch = (level, message) => {
      setState({ level, message, key: Date.now() })
    }
    return () => {
      dispatch = null
    }
  }, [])

  if (!state) return null

  return (
    <Celebrate
      key={state.key}
      trigger={true}
      level={state.level}
      message={state.message}
      onDone={() => setState(null)}
    />
  )
}

/** 给调用方包装的 hook：返回一个 trigger props 的 helper */
export function useCelebrate(): {
  fire: (level: CelebrateLevel, message?: string) => void
} {
  return { fire: fireCelebrate }
}
