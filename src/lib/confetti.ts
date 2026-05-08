/**
 * 彩带 / 完成动画 helper —— 用 canvas-confetti 库（MIT, ~10KB gzip）。
 *
 * 复刻你老 HTML 的 fireConfetti 实现：
 *   - 单例 canvas 挂在 body 顶层（z-index 9999999, pointer-events none）
 *   - useWorker: false 避免和 Web Worker 冲突
 *   - 8 色调色（你老 HTML 原配色,带"地铁狂欢"血统）
 *
 * 三个公开函数：
 *   fireBootConfetti()       —— 启动欢迎页用,1.8s 间歇式撒
 *   fireCompletionConfetti() —— 番茄完成 / 大成就用,左右两侧对称爆开
 *   fireSmallConfetti()      —— 加交易/打卡等小成就用,单点轻量
 */

import confetti from 'canvas-confetti'

type ScopedConfetti = ReturnType<typeof confetti.create>

let scoped: ScopedConfetti | null = null

function ensure(): ScopedConfetti | null {
  if (scoped) return scoped
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 100vw',
    'height: 100vh',
    'pointer-events: none',
    'z-index: 9999999',
  ].join(';')
  document.body.appendChild(canvas)
  scoped = confetti.create(canvas, { resize: true, useWorker: false })
  return scoped
}

const COLORS = [
  '#FF8C42', // 橙
  '#FF6B8B', // 粉
  '#F9C74F', // 蜜黄
  '#43AA8B', // 草绿
  '#4D9DE0', // 天蓝
  '#9B5DE5', // 紫
  '#ee2c79', // 桃红
  '#fcd217', // 金黄
]

function rng(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

/**
 * 启动欢迎页彩带 —— 1.8s 间歇式从屏幕各处撒,粒子数随时间线性衰减。
 * 完全对齐老 HTML 的 boot screen 行为。
 */
export function fireBootConfetti(durationMs: number = 1800): void {
  const fc = ensure()
  if (!fc) return
  const animationEnd = Date.now() + durationMs
  const defaults = {
    startVelocity: 45,
    spread: 360,
    ticks: 100,
    colors: COLORS,
  }
  const interval = setInterval(() => {
    const timeLeft = animationEnd - Date.now()
    if (timeLeft <= 0) {
      clearInterval(interval)
      return
    }
    const particleCount = Math.floor(266 * (timeLeft / durationMs))
    void fc({
      ...defaults,
      particleCount,
      origin: { x: rng(0.1, 0.9), y: Math.random() - 0.2 },
    })
  }, 250)
}

/**
 * 完成动画彩带 —— 左右两侧对称同时爆开,适合番茄钟自然完成。
 */
export function fireCompletionConfetti(): void {
  const fc = ensure()
  if (!fc) return
  const defaults = {
    startVelocity: 45,
    spread: 360,
    ticks: 100,
    colors: COLORS,
    particleCount: 80,
  }
  // 左侧爆开
  void fc({
    ...defaults,
    origin: { x: rng(0.1, 0.3), y: Math.random() - 0.2 },
  })
  // 右侧爆开
  void fc({
    ...defaults,
    origin: { x: rng(0.7, 0.9), y: Math.random() - 0.2 },
  })
}

/**
 * 小庆祝 —— 单点轻量爆开,加交易/习惯打卡用。
 */
export function fireSmallConfetti(originY: number = 0.6): void {
  const fc = ensure()
  if (!fc) return
  void fc({
    particleCount: 40,
    spread: 80,
    startVelocity: 30,
    ticks: 80,
    origin: { x: 0.5, y: originY },
    colors: COLORS,
  })
}
