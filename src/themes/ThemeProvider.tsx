import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_THEME,
  THEMES,
  themeToCssVars,
  type ThemeId,
  type ThemeTokens,
} from './themes'

const STORAGE_KEY = 'banya_theme'
/** 是否启用"白天暖桃 / 夜晚震金"自动切换 */
const AUTO_DARK_KEY = 'banya_theme_auto_dark'

interface ThemeContextValue {
  themeId: ThemeId
  theme: ThemeTokens
  setTheme: (id: ThemeId) => void
  /** 自动暗色:跟随系统 prefers-color-scheme */
  autoDark: boolean
  setAutoDark: (v: boolean) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && raw in THEMES) return raw as ThemeId
  } catch {
    // localStorage 不可用(隐私模式 / 服务端渲染)→ 用默认
  }
  return DEFAULT_THEME
}

function readAutoDark(): boolean {
  try {
    return localStorage.getItem(AUTO_DARK_KEY) === '1'
  } catch {
    return false
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(readStoredTheme)
  const [autoDark, setAutoDarkState] = useState<boolean>(readAutoDark)

  /** 应用 CSS 变量到 :root,使全局所有组件取色 */
  useEffect(() => {
    const vars = themeToCssVars(THEMES[themeId])
    const root = document.documentElement
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v)
    }
    root.dataset.theme = themeId
    // 给 body 也加 class,方便选择器:body.is-dark .x { ... }
    document.body.classList.toggle('is-dark', THEMES[themeId].isDark)
  }, [themeId])

  /** 持久化 */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, themeId)
    } catch {
      // 无所谓
    }
  }, [themeId])

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_DARK_KEY, autoDark ? '1' : '0')
    } catch {
      // 无所谓
    }
  }, [autoDark])

  /**
   * 自动暗色:开启时,根据 prefers-color-scheme 在 warm-peach ↔ night-gold 之间切。
   * 用户主动选了别的主题(如 madrid-dusk),不再自动覆盖,直到关闭再开启。
   */
  useEffect(() => {
    if (!autoDark) return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      setThemeIdState(mql.matches ? 'night-gold' : 'warm-peach')
    }
    apply()
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [autoDark])

  const setTheme = useCallback((id: ThemeId) => {
    setThemeIdState(id)
    // 用户主动选 → 关闭自动暗色,避免立刻被覆盖
    setAutoDarkState(false)
  }, [])

  const setAutoDark = useCallback((v: boolean) => {
    setAutoDarkState(v)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      theme: THEMES[themeId],
      setTheme,
      autoDark,
      setAutoDark,
    }),
    [themeId, autoDark, setTheme, setAutoDark],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
