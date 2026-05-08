import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { getWelcomeCooldownHours } from '@/lib/preferences'
import { fireBootConfetti } from '@/lib/confetti'

/**
 * 启动欢迎页 —— 复刻老 HTML 的 #os-boot-screen。
 *
 * 老 HTML 原貌（已对齐）：
 *   - 全屏 fixed 顶层
 *   - 大字"欢迎回来！"，font-mono + clamp(36px, 6vw, 80px)，字重 900
 *   - 渐变 (orange → pink → purple → sky) 135deg，3s 循环流动
 *   - spring pop：scale(0.3) translateY(40px) → scale(1) translateY(0)
 *   - 0.5s fade-out 离场
 *
 * 多语言：按 navigator.language 自动选 中/英/西/法
 *
 * 触发时机：每天首次访问 OR 距上次 > 6 小时
 *  - 用 localStorage 'banya_welcome_last_seen' 存 ISO 时间
 *  - 不消耗 sessionStorage（手机 app 切换会清）
 */

const STORAGE_KEY = 'banya_welcome_last_seen'
const DISPLAY_MS = 1800

interface Greeting {
  text: string
  /** 西文字体优先，配合 font-mono 显示数字感 */
  langTag: string
}

function pickGreeting(hour: number): Record<string, Greeting> {
  // 4 套语言 × 3 时段
  const morning: Record<string, string> = {
    'zh-CN': '早上好鸭~',
    en: 'Good morning',
    es: 'Buenos días',
    fr: 'Bonjour',
  }
  const afternoon: Record<string, string> = {
    'zh-CN': '欢迎回来',
    en: 'Welcome back',
    es: 'Hola de nuevo',
    fr: 'Te revoilà',
  }
  const evening: Record<string, string> = {
    'zh-CN': '晚上好呀',
    en: 'Good evening',
    es: 'Buenas noches',
    fr: 'Bonsoir',
  }

  const map = hour < 12 ? morning : hour < 18 ? afternoon : evening
  return Object.fromEntries(
    Object.entries(map).map(([k, v]) => [k, { text: v, langTag: k }]),
  )
}

function detectLang(): 'zh-CN' | 'en' | 'es' | 'fr' {
  if (typeof navigator === 'undefined') return 'zh-CN'
  const lang = navigator.language.toLowerCase()
  if (lang.startsWith('zh')) return 'zh-CN'
  if (lang.startsWith('es')) return 'es'
  if (lang.startsWith('fr')) return 'fr'
  return 'en'
}

function shouldShow(): boolean {
  try {
    const cooldownHours = getWelcomeCooldownHours()
    // 0 = 用户彻底关闭欢迎页
    if (cooldownHours <= 0) return false
    const cooldownMs = cooldownHours * 60 * 60 * 1000
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return true
    const last = new Date(raw).getTime()
    if (Number.isNaN(last)) return true
    return Date.now() - last > cooldownMs
  } catch {
    return true
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString())
  } catch {
    // 无所谓
  }
}

export function WelcomeSplash() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!shouldShow()) return
    setShow(true)
    markSeen()
    // 撒彩带 —— 完全复刻老 HTML 的 boot screen 行为
    fireBootConfetti(DISPLAY_MS)
    const t = setTimeout(() => setShow(false), DISPLAY_MS)
    return () => clearTimeout(t)
  }, [])

  if (!show) return null

  const hour = new Date().getHours()
  const lang = detectLang()
  const greeting = pickGreeting(hour)[lang]!

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          onClick={() => setShow(false)}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{
            background: 'var(--bn-bg)',
            cursor: 'pointer',
          }}
        >
          {/* 渐变文字（CSS 类 .bn-gradient-text 已在 index.css 定义） */}
          <motion.h1
            initial={{ opacity: 0, scale: 0.3, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              type: 'spring',
              stiffness: 280,
              damping: 14,
              mass: 0.8,
            }}
            className="bn-gradient-text"
            lang={greeting.langTag}
            style={{
              fontFamily: 'var(--bn-font-mono)',
              fontWeight: 800,
              fontSize: 'clamp(36px, 8vw, 84px)',
              letterSpacing: '-0.04em',
              margin: 0,
              filter: 'drop-shadow(0 10px 25px rgba(255, 107, 139, 0.28))',
              textAlign: 'center',
              padding: '0 24px',
            }}
          >
            {greeting.text}
          </motion.h1>

          {/* 副文案：留学第 N 天 */}
          <DaysAbroad />

          {/* 提示：点任意处跳过 */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            style={{
              marginTop: 28,
              fontSize: 'var(--bn-text-xs)',
              color: 'var(--bn-text-tertiary)',
              letterSpacing: '0.06em',
            }}
          >
            tap to skip
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** 副标：留学第 N 天 —— 可选显示，依赖 localStorage 里的入境日 */
function DaysAbroad() {
  const days = (() => {
    try {
      const raw = localStorage.getItem('banya_arrival_date')
      if (!raw) return null
      const arrival = new Date(raw)
      if (Number.isNaN(arrival.getTime())) return null
      const ms = Date.now() - arrival.getTime()
      const d = Math.floor(ms / 86_400_000) + 1
      return d > 0 ? d : null
    } catch {
      return null
    }
  })()

  if (!days) return null

  return (
    <motion.p
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 0.7, y: 0 }}
      transition={{ delay: 0.35, duration: 0.4 }}
      className="bn-mono"
      style={{
        marginTop: 18,
        fontSize: 'var(--bn-text-md)',
        color: 'var(--bn-text-secondary)',
        letterSpacing: '-0.005em',
      }}
    >
      留学第 {days} 天
    </motion.p>
  )
}
