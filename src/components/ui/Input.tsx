import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, style, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-xl px-3 py-2 text-sm outline-none transition-all',
        'bn-glass focus:ring-2',
        'placeholder:opacity-60',
        className,
      )}
      style={{
        color: 'var(--bn-text-primary)',
        ...style,
      }}
      {...rest}
    />
  ),
)
Input.displayName = 'Input'
