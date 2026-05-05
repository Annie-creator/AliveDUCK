import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'glass' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const sizeMap: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-5 py-2.5 text-sm rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = 'primary', size = 'md', style, ...rest }, ref) => {
    const variantStyle =
      variant === 'primary'
        ? {
            background: 'var(--bn-button-bg)',
            color: 'var(--bn-button-fg)',
          }
        : variant === 'danger'
          ? {
              background: 'var(--bn-negative)',
              color: '#fff',
            }
          : undefined

    const variantClass =
      variant === 'glass'
        ? 'bn-glass hover:bg-white/10'
        : variant === 'ghost'
          ? 'bg-transparent hover:bg-white/10'
          : ''

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium tracking-tight transition-all',
          'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
          sizeMap[size],
          variantClass,
          className,
        )}
        style={{
          ...variantStyle,
          color: variant === 'glass' || variant === 'ghost' ? 'var(--bn-text-primary)' : undefined,
          ...style,
        }}
        {...rest}
      />
    )
  },
)
Button.displayName = 'Button'
