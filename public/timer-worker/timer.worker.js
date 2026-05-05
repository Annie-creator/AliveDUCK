/**
 * 番茄钟计时 Web Worker
 *
 * 关键设计:基于绝对时间戳计算剩余,而不是 count--。
 * 这意味着即便 Worker 被浏览器节流(后台 tab),只要恢复就能立即算出真正的剩余时间。
 *
 * 通信协议:
 *   主线程 → Worker:
 *     { type: 'start', endAt: number }       // endAt 是结束的绝对时间戳 ms
 *     { type: 'pause' }
 *     { type: 'resume', endAt: number }
 *     { type: 'stop' }
 *   Worker → 主线程:
 *     { type: 'tick', remainingMs: number }
 *     { type: 'done' }
 */

let intervalId = null
let endAt = 0
let paused = false
let pauseRemaining = 0

function clear() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function tick() {
  if (paused) return
  const now = Date.now()
  const remaining = Math.max(0, endAt - now)
  self.postMessage({ type: 'tick', remainingMs: remaining })
  if (remaining <= 0) {
    clear()
    self.postMessage({ type: 'done' })
  }
}

self.onmessage = (e) => {
  const msg = e.data
  switch (msg.type) {
    case 'start':
      clear()
      paused = false
      endAt = msg.endAt
      intervalId = setInterval(tick, 250) // 250ms 粒度,足够顺滑且省电
      tick()
      break
    case 'pause':
      paused = true
      clear()
      pauseRemaining = Math.max(0, endAt - Date.now())
      self.postMessage({ type: 'tick', remainingMs: pauseRemaining })
      break
    case 'resume':
      paused = false
      endAt = msg.endAt
      intervalId = setInterval(tick, 250)
      tick()
      break
    case 'stop':
      clear()
      paused = false
      self.postMessage({ type: 'tick', remainingMs: 0 })
      break
  }
}
