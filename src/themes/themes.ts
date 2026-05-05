/**
 * 主题定义 —— 5 套配色 + 光感 + 字体的完整声明。
 *
 * 设计原则:
 * - 每个主题就是一组 CSS 变量,运行时切换无延迟
 * - 主题切换不刷新页面,所有组件用变量取色
 * - 类型严格:加新主题或改字段,TS 会推到所有引用点
 */

export type ThemeId = 'warm-peach' | 'cool-mist' | 'metro-carnival' | 'madrid-dusk' | 'night-gold'

export interface ThemeTokens {
  /** 整页背景渐变 */
  bg: string
  /** 三个氛围 blob 的颜色(top-left / bottom-right / top-right) */
  blob1: string
  blob2: string
  blob3: string

  /** 玻璃表面的两档透明度 */
  glass: string
  glassStrong: string
  glassBorder: string

  /** 文本三档 */
  textPrimary: string
  textSecondary: string
  textTertiary: string

  /** 唯一签名色(logo / 主按钮 / 强调态)*/
  accent: string

  /** 4 个分类点位的色,在记账/标签里循环用 */
  cat1: string
  cat2: string
  cat3: string
  cat4: string

  /** 正向语义(收入、增长、成功)*/
  positive: string
  /** 负向语义(支出、错误)*/
  negative: string

  /** 主按钮的填充和文字 */
  buttonBg: string
  buttonFg: string

  /** 行级分隔线 */
  rowBorder: string

  /** 导航/tab 选中态:背景填充 + 嵌入式阴影 */
  navActiveBg: string
  navActiveShadow: string

  /** 是否要在马德里主题下额外渲染 SVG 天际线 */
  hasSkyline: boolean

  /** 是否暗色模式(影响图标、阴影等不能用变量的地方)*/
  isDark: boolean
}

export interface ThemeMeta {
  id: ThemeId
  /** 显示名称 */
  name: string
  /** 一行描述 */
  description: string
  /** 在主题选择器里展示的 3 个色块 */
  swatches: [string, string, string]
}

export const THEMES: Record<ThemeId, ThemeTokens> = {
  'warm-peach': {
    bg: 'linear-gradient(135deg, #FDE0C8 0%, #F8C8C0 30%, #E5C8E0 65%, #C8DCE8 100%)',
    blob1: 'rgba(255, 180, 140, 0.7)',
    blob2: 'rgba(180, 160, 220, 0.55)',
    blob3: 'rgba(255, 210, 170, 0.5)',
    glass: 'rgba(255, 255, 255, 0.45)',
    glassStrong: 'rgba(255, 255, 255, 0.55)',
    glassBorder: 'rgba(255, 255, 255, 0.65)',
    textPrimary: '#2A2926',
    textSecondary: '#6B6961',
    textTertiary: '#9D9C95',
    accent: '#C8553D',
    cat1: '#C8553D',
    cat2: '#5B8AA8',
    cat3: '#7AA876',
    cat4: '#B89968',
    positive: '#7AA876',
    negative: '#C8553D',
    buttonBg: '#C8553D',
    buttonFg: '#FFFFFF',
    rowBorder: 'rgba(0, 0, 0, 0.06)',
    navActiveBg: 'rgba(0, 0, 0, 0.06)',
    navActiveShadow:
      'inset 0 1px 2px rgba(0, 0, 0, 0.06), inset 0 -0.5px 0 rgba(255, 255, 255, 0.4)',
    hasSkyline: false,
    isDark: false,
  },

  'cool-mist': {
    bg: 'linear-gradient(135deg, #DCE8E5 0%, #C5D5DC 30%, #C5CDDC 65%, #D5DCE0 100%)',
    blob1: 'rgba(140, 180, 200, 0.55)',
    blob2: 'rgba(160, 200, 195, 0.45)',
    blob3: 'rgba(180, 195, 220, 0.5)',
    glass: 'rgba(255, 255, 255, 0.45)',
    glassStrong: 'rgba(255, 255, 255, 0.55)',
    glassBorder: 'rgba(255, 255, 255, 0.7)',
    textPrimary: '#1F2D33',
    textSecondary: '#5C6B73',
    textTertiary: '#93A0A8',
    accent: '#2D5F6F',
    cat1: '#2D5F6F',
    cat2: '#4A7068',
    cat3: '#5E5F7C',
    cat4: '#7A6F5E',
    positive: '#4A7068',
    negative: '#A24A4A',
    buttonBg: '#2D5F6F',
    buttonFg: '#FFFFFF',
    rowBorder: 'rgba(0, 0, 0, 0.07)',
    navActiveBg: 'rgba(31, 45, 51, 0.07)',
    navActiveShadow:
      'inset 0 1px 2px rgba(31, 45, 51, 0.08), inset 0 -0.5px 0 rgba(255, 255, 255, 0.4)',
    hasSkyline: false,
    isDark: false,
  },

  'metro-carnival': {
    bg: 'linear-gradient(135deg, #FAF7EE 0%, #F7F2E5 50%, #F4ECDC 100%)',
    blob1: 'rgba(255, 140, 66, 0.18)',
    blob2: 'rgba(155, 93, 229, 0.15)',
    blob3: 'rgba(67, 170, 139, 0.18)',
    glass: 'rgba(255, 255, 255, 0.55)',
    glassStrong: 'rgba(255, 255, 255, 0.7)',
    glassBorder: 'rgba(255, 255, 255, 0.85)',
    textPrimary: '#1F1F1B',
    textSecondary: '#6E6961',
    textTertiary: '#A09B92',
    accent: '#E8743C',
    cat1: '#FF8C42',
    cat2: '#FF6B8B',
    cat3: '#43AA8B',
    cat4: '#4D9DE0',
    positive: '#43AA8B',
    negative: '#E8743C',
    buttonBg: '#E8743C',
    buttonFg: '#FFFFFF',
    rowBorder: 'rgba(0, 0, 0, 0.06)',
    navActiveBg: 'rgba(0, 0, 0, 0.05)',
    navActiveShadow:
      'inset 0 1px 2px rgba(0, 0, 0, 0.05), inset 0 -0.5px 0 rgba(255, 255, 255, 0.5)',
    hasSkyline: false,
    isDark: false,
  },

  'madrid-dusk': {
    bg: 'linear-gradient(180deg, #2C1B5E 0%, #6B3060 25%, #C75A4A 55%, #F4A261 80%, #FFE5C4 100%)',
    blob1: 'rgba(255, 200, 100, 0.3)',
    blob2: 'rgba(180, 60, 80, 0.25)',
    blob3: 'rgba(80, 40, 100, 0.3)',
    glass: 'rgba(0, 0, 0, 0.22)',
    glassStrong: 'rgba(0, 0, 0, 0.32)',
    glassBorder: 'rgba(255, 255, 255, 0.22)',
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.78)',
    textTertiary: 'rgba(255, 255, 255, 0.55)',
    accent: '#F4D5A8',
    cat1: '#FFB877',
    cat2: '#C8A8E0',
    cat3: '#A8D4C0',
    cat4: '#F8C8A8',
    positive: '#B8E0C0',
    negative: '#FFB877',
    buttonBg: 'rgba(255, 255, 255, 0.95)',
    buttonFg: '#2A1B3D',
    rowBorder: 'rgba(255, 255, 255, 0.12)',
    navActiveBg: 'rgba(0, 0, 0, 0.4)',
    navActiveShadow:
      'inset 0 1px 3px rgba(0, 0, 0, 0.5), inset 0 -0.5px 0 rgba(255, 255, 255, 0.06)',
    hasSkyline: true,
    isDark: true,
  },

  'night-gold': {
    bg: 'linear-gradient(135deg, #1A1726 0%, #251F2E 50%, #1F2330 100%)',
    blob1: 'rgba(212, 175, 55, 0.15)',
    blob2: 'rgba(150, 100, 200, 0.12)',
    blob3: 'rgba(50, 100, 150, 0.12)',
    glass: 'rgba(255, 255, 255, 0.06)',
    glassStrong: 'rgba(255, 255, 255, 0.1)',
    glassBorder: 'rgba(255, 255, 255, 0.14)',
    textPrimary: '#E8E5DD',
    textSecondary: '#A8A39B',
    textTertiary: '#6E6963',
    accent: '#C8A36F',
    cat1: '#C8A36F',
    cat2: '#8FB1C8',
    cat3: '#8FB89B',
    cat4: '#B59A6E',
    positive: '#8FB89B',
    negative: '#D89A8A',
    buttonBg: '#C8A36F',
    buttonFg: '#1A1726',
    rowBorder: 'rgba(255, 255, 255, 0.08)',
    navActiveBg: 'rgba(0, 0, 0, 0.35)',
    navActiveShadow:
      'inset 0 1px 2px rgba(0, 0, 0, 0.5), inset 0 -0.5px 0 rgba(255, 255, 255, 0.04)',
    hasSkyline: false,
    isDark: true,
  },
}

export const THEME_META: Record<ThemeId, ThemeMeta> = {
  'warm-peach': {
    id: 'warm-peach',
    name: '暖桃黄昏',
    description: '马德里 18 点的色温,日常默认',
    swatches: ['#FDE0C8', '#F8C8C0', '#C8DCE8'],
  },
  'cool-mist': {
    id: 'cool-mist',
    name: '冷雾晨光',
    description: '北欧理性,适合长时间专注',
    swatches: ['#DCE8E5', '#C5D5DC', '#C5CDDC'],
  },
  'metro-carnival': {
    id: 'metro-carnival',
    name: 'Metro 嘉年华',
    description: '保留多彩 DNA,加毛玻璃驯化',
    swatches: ['#FF8C42', '#FF6B8B', '#43AA8B'],
  },
  'madrid-dusk': {
    id: 'madrid-dusk',
    name: '马德里黄昏',
    description: '黄昏天空 + 城市天际线,心情主题',
    swatches: ['#2C1B5E', '#C75A4A', '#F4A261'],
  },
  'night-gold': {
    id: 'night-gold',
    name: '夜色震金',
    description: '深紫蓝 + 香槟金,夜间记录',
    swatches: ['#1A1726', '#C8A36F', '#251F2E'],
  },
}

export const THEME_ORDER: ThemeId[] = [
  'warm-peach',
  'cool-mist',
  'metro-carnival',
  'madrid-dusk',
  'night-gold',
]

export const DEFAULT_THEME: ThemeId = 'warm-peach'

/**
 * 把主题对象转成 CSS 变量字典,挂到 :root 或元素 style 上。
 * 命名约定:`--bn-` 前缀避免和宿主样式冲突,bn = banya。
 */
export function themeToCssVars(t: ThemeTokens): Record<string, string> {
  return {
    '--bn-bg': t.bg,
    '--bn-blob-1': t.blob1,
    '--bn-blob-2': t.blob2,
    '--bn-blob-3': t.blob3,
    '--bn-glass': t.glass,
    '--bn-glass-strong': t.glassStrong,
    '--bn-glass-border': t.glassBorder,
    '--bn-text-primary': t.textPrimary,
    '--bn-text-secondary': t.textSecondary,
    '--bn-text-tertiary': t.textTertiary,
    '--bn-accent': t.accent,
    '--bn-cat-1': t.cat1,
    '--bn-cat-2': t.cat2,
    '--bn-cat-3': t.cat3,
    '--bn-cat-4': t.cat4,
    '--bn-positive': t.positive,
    '--bn-negative': t.negative,
    '--bn-button-bg': t.buttonBg,
    '--bn-button-fg': t.buttonFg,
    '--bn-row-border': t.rowBorder,
    '--bn-nav-active-bg': t.navActiveBg,
    '--bn-nav-active-shadow': t.navActiveShadow,
  }
}
