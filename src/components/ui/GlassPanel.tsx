import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** 玻璃强度档位 */
  variant?: 'default' | 'strong' | 'thin'
  /** 圆角档位 */
  radius?: 'md' | 'lg' | 'xl'
  /** 内边距档位 */
  padding?: 'sm' | 'md' | 'lg' | 'none'
}

const radiusMap = {
  md: 'rounded-xl', // 12
  lg: 'rounded-2xl', // 16
  xl: 'rounded-3xl', // 24
} as const

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
} as const

const variantMap = {
  default: 'bn-glass',
  strong: 'bn-glass-strong',
  thin: 'bn-glass-thin',
} as const

/** 应用里所有"卡片"都基于这个组件 —— 主题切换时自动跟变 */
export const GlassPanel = forwardRef<HTMLDivElement, Props>(
  ({ className, variant = 'default', radius = 'lg', padding = 'md', ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(variantMap[variant], radiusMap[radius], paddingMap[padding], className)}
      {...rest}
    />
  ),
)
GlassPanel.displayName = 'GlassPanel'
