import { motion, useMotionValue, useTransform, useAnimationControls, type PanInfo } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface ListRowProps {
  /** 32~40px 的左侧装饰位（圆形图标、emoji、彩色圆点），由调用方传入完整节点 */
  leading?: ReactNode
  /** 主标题（强对比，size: text-md / weight 500） */
  title: ReactNode
  /** 副标题（弱对比，size: text-sm / tertiary） */
  subtitle?: ReactNode
  /** 右侧主信息：金额、时间、状态徽章等 */
  trailing?: ReactNode
  /** 点击整行（不含划删区） */
  onClick?: () => void
  /** 划删 → 露出删除按钮 → 二次点击触发；为 undefined 则关闭划删 */
  onDelete?: () => void
  /** 自定义 leading 容器宽度，默认 40px */
  leadingWidth?: number
  /** 末行去掉下边线 */
  isLast?: boolean
  className?: string
}

/**
 * 通用列表行组件 —— 整个 app 的列表都基于它。
 *
 * 视觉契约（不可破坏）：
 *  ┌────────┬─────────────────────┬────────┐
 *  │ leading│ title               │trailing│
 *  │  40px  │ subtitle            │  auto  │
 *  └────────┴─────────────────────┴────────┘
 *  • 3 列 grid 保证多行对齐
 *  • title 字重 500 / 16px / primary
 *  • subtitle 字重 400 / 13px / tertiary
 *  • trailing 给 auto，金额自然右对齐
 *  • hover 整行有 subtle 灰底；不加边框，不卡片化
 *  • 划删：iOS 风格，左划露出 88px 红色删除区
 */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  onDelete,
  leadingWidth = 40,
  isLast = false,
  className,
}: ListRowProps) {
  const x = useMotionValue(0)
  const controls = useAnimationControls()
  const containerRef = useRef<HTMLDivElement>(null)

  // 删除区透明度：0 → -50px 内从 0 涨到 1，鼓励用户继续划
  const deleteOpacity = useTransform(x, [-88, -30, 0], [1, 0.6, 0])

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (!onDelete) return
    const offset = info.offset.x
    const velocity = info.velocity.x
    // 划过半 OR 速度大 → snap 到 -88（露出删除区）
    if (offset < -44 || velocity < -300) {
      void controls.start({ x: -88, transition: { type: 'spring', stiffness: 400, damping: 35 } })
    } else {
      void controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 35 } })
    }
  }

  function handleDelete() {
    void controls.start({
      x: -window.innerWidth,
      opacity: 0,
      transition: { duration: 0.25, ease: 'easeIn' },
    })
    setTimeout(() => onDelete?.(), 230)
  }

  function resetSwipe() {
    void controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 35 } })
  }

  // 点击行内容时如果当前划开了，先收回；否则触发 onClick
  function handleRowClick() {
    if (x.get() < -10) {
      resetSwipe()
      return
    }
    onClick?.()
  }

  const RowContent = (
    <div
      className={cn(
        'group grid items-center gap-x-3 gap-y-0 px-3 py-3 transition-colors',
        onClick && 'cursor-pointer hover:bg-white/[0.04]',
        className,
      )}
      style={{
        gridTemplateColumns: `${leadingWidth}px minmax(0, 1fr) auto`,
        borderBottom: isLast ? 'none' : '0.5px solid var(--bn-row-border)',
      }}
      onClick={handleRowClick}
    >
      {/* leading */}
      <div className="flex items-center justify-start" style={{ minHeight: 40 }}>
        {leading}
      </div>

      {/* title + subtitle */}
      <div className="min-w-0">
        <div
          className="truncate"
          style={{
            fontSize: 'var(--bn-text-md)',
            fontWeight: 500,
            color: 'var(--bn-text-primary)',
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            className="mt-0.5 truncate"
            style={{
              fontSize: 'var(--bn-text-sm)',
              color: 'var(--bn-text-tertiary)',
              fontWeight: 400,
              letterSpacing: '-0.005em',
              lineHeight: 1.4,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {/* trailing */}
      {trailing && (
        <div className="shrink-0 pl-2 text-right">
          {trailing}
        </div>
      )}
    </div>
  )

  // 不开启划删：直接渲染
  if (!onDelete) {
    return RowContent
  }

  // 开启划删：包一层 motion.div，下方铺红色删除区
  return (
    <div ref={containerRef} className="bn-swipe-row relative overflow-hidden">
      {/* 红色删除背景（永远在底层） */}
      <motion.button
        type="button"
        onClick={handleDelete}
        aria-label="删除"
        className="absolute right-0 top-0 flex h-full w-[88px] items-center justify-center"
        style={{
          background: 'var(--bn-negative)',
          color: '#fff',
          opacity: deleteOpacity,
        }}
      >
        <Trash2 size={18} strokeWidth={2} />
      </motion.button>

      {/* 上层可拖动行 */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -88, right: 0 }}
        dragElastic={0.06}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ x, background: 'var(--bn-glass)', backdropFilter: 'blur(8px)' }}
      >
        {RowContent}
      </motion.div>
    </div>
  )
}
