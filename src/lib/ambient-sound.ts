/**
 * 环境音播放器（Web Audio 程序合成版）。
 *
 * 重要变更（2026-05 重写）：
 *   - 旧版用 Pixabay CDN mp3 直链 → Pixabay 官方禁止 hotlink，部署后会 403
 *   - 新版完全用 Web Audio API 程序合成 → 永不依赖外部资源、跨域无关、离线可用
 *   - 全部音色都是循环 buffer，无缝衔接，CPU 占用极低
 *
 * 音色清单：
 *   - none       纯净无声
 *   - rain       雨声         （滤波白噪音 + 雨滴脉冲）
 *   - whitenoise 白噪音       （纯随机）
 *   - pink       粉红噪音     （1/f 噪音，比白噪音柔和，最适合学习）
 *   - brown      棕色噪音/海浪 （积分白噪音，深沉，模拟海浪）
 *   - fire       篝火         （低通白噪音 + 随机噼啪脉冲）
 *   - hum        暖白噪音     （低通粉红噪音 + 极低 LFO 调制，咖啡馆替代）
 *
 * 旧版的 cafe / forest / ocean 已并入新音色：
 *   - cafe   → hum   （暖白噪音替代咖啡馆人声底噪）
 *   - forest → pink  （粉红噪音替代森林环境）
 *   - ocean  → brown （棕色噪音的呼吸感天然像海浪）
 *
 * 全部音色支持试听 / 主播放 / 暂停 / 恢复 / 音量调整。
 */

export type AmbientSoundKey =
  | 'none'
  | 'rain'
  | 'whitenoise'
  | 'pink'
  | 'brown'
  | 'fire'
  | 'hum'

export interface AmbientSoundOption {
  key: AmbientSoundKey
  name: string
  emoji: string
  /** 一句话描述,显示在选项下方 */
  hint: string
}

export const AMBIENT_SOUNDS: AmbientSoundOption[] = [
  { key: 'none',       name: '纯净无声', emoji: '🤫', hint: '专心致志' },
  { key: 'rain',       name: '雨声',     emoji: '🌧️',  hint: '滴滴答答 · 沙沙白噪' },
  { key: 'brown',      name: '海浪',     emoji: '🌊', hint: '低频起伏 · 深沉舒缓' },
  { key: 'fire',       name: '篝火',     emoji: '🔥', hint: '噼啪温暖 · 像在露营' },
  { key: 'hum',        name: '咖啡馆',   emoji: '☕', hint: '暖底噪 · 像在角落' },
  { key: 'pink',       name: '粉红噪音', emoji: '🌸', hint: '比白噪音柔和' },
  { key: 'whitenoise', name: '白噪音',   emoji: '⚪', hint: '纯净屏蔽干扰' },
]

/** 老 HTML 时代的 5 个 B 站视频 — 留给"想要真实场景的人"做长内容跳转 */
export const LEGACY_BILIBILI_BGM: Array<{ name: string; bvid: string }> = [
  { name: '八段锦',                  bvid: 'BV1gT4y1m7ec' },
  { name: '分列式进行曲(提神醒脑)',  bvid: 'BV16NAEzkE4y' },
  { name: '寺庙梵音(冥想静心)',      bvid: 'BV1dt42177V8' },
  { name: '红星闪闪(热血破冰)',      bvid: 'BV1Fweyz8ENC' },
  { name: '夏日听雨',                bvid: 'BV1ji4y1Y77p' },
]

/* ─────────────────────────────────────────────────────
 * Web Audio 单例
 * ─────────────────────────────────────────────────────*/

/** 老版本 ambientSound 字段做兼容映射（用户历史 config 里可能存了旧 key） */
const LEGACY_KEY_MAP: Record<string, AmbientSoundKey> = {
  cafe: 'hum',
  ocean: 'brown',
  forest: 'pink',
}

function normalizeKey(raw: string): AmbientSoundKey {
  const legacy = LEGACY_KEY_MAP[raw]
  if (legacy) return legacy
  // 检查是否是当前合法 key
  const valid = AMBIENT_SOUNDS.some((s) => s.key === raw)
  return valid ? (raw as AmbientSoundKey) : 'none'
}

/** 暴露给外部：把可能是旧版字符串的 ambientSound 字段规范化成当前合法 key */
export function normalizeAmbientKey(raw: string): AmbientSoundKey {
  return normalizeKey(raw)
}

class AmbientPlayer {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private currentKey: AmbientSoundKey = 'none'
  /** 当前正在播放的所有 audio nodes,切换时统一停掉 */
  private nodes: AudioScheduledSourceNode[] = []
  /** LFO / 调制定时器,切换时清掉 */
  private timers: ReturnType<typeof setInterval>[] = []
  /** 试听用：自动停止的 timeout */
  private previewTimeout: ReturnType<typeof setTimeout> | null = null

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.value = 0.4
      this.masterGain.connect(this.ctx.destination)
    }
    // 浏览器自动播放策略要求第一次必须由用户手势激活
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

  /** 设置音色并开始循环播放 */
  setSound(rawKey: string, volume: number): void {
    const key = normalizeKey(rawKey)
    if (key === this.currentKey && this.nodes.length > 0) {
      // 同 key 且在播 → 只调音量
      if (this.masterGain) this.masterGain.gain.value = volume
      return
    }
    this.stopInternal()
    this.currentKey = key
    if (key === 'none') return

    const ctx = this.ensureCtx()
    if (this.masterGain) this.masterGain.gain.value = volume

    switch (key) {
      case 'whitenoise':  this.startWhiteNoise(ctx); break
      case 'pink':        this.startPinkNoise(ctx); break
      case 'brown':       this.startBrownNoise(ctx); break
      case 'rain':        this.startRain(ctx); break
      case 'fire':        this.startFire(ctx); break
      case 'hum':         this.startHum(ctx); break
    }
  }

  /** 试听 N 秒后自动停（番茄钟未启动时点选项立即出声反馈） */
  preview(rawKey: string, volume: number, durationMs: number = 3000): void {
    if (this.previewTimeout) clearTimeout(this.previewTimeout)
    this.setSound(rawKey, volume)
    this.previewTimeout = setTimeout(() => {
      this.stopInternal()
      this.currentKey = 'none'
      this.previewTimeout = null
    }, durationMs)
  }

  setVolume(v: number): void {
    if (this.masterGain) this.masterGain.gain.value = v
  }

  pause(): void {
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend()
    }
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
  }

  stop(): void {
    if (this.previewTimeout) {
      clearTimeout(this.previewTimeout)
      this.previewTimeout = null
    }
    this.stopInternal()
    this.currentKey = 'none'
  }

  private stopInternal(): void {
    this.timers.forEach((t) => clearInterval(t))
    this.timers = []
    this.nodes.forEach((n) => {
      try {
        n.stop()
      } catch {
        // 已停过,忽略
      }
    })
    this.nodes = []
  }

  isPlaying(): boolean {
    return this.nodes.length > 0 && this.ctx?.state === 'running'
  }

  getCurrentKey(): AmbientSoundKey {
    return this.currentKey
  }

  /* ── 内部音色生成器 ──────────────────────────────── */

  /** 生成一段 N 秒的白噪音 buffer（可循环） */
  private makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  /** Voss-McCartney 算法生成粉红噪音（1/f） */
  private makePinkBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.96900 * b2 + w * 0.1538520
      b3 = 0.86650 * b3 + w * 0.3104856
      b4 = 0.55000 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.0168980
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    }
    return buf
  }

  /** 棕色噪音 = 积分白噪音（低频强,深沉） */
  private makeBrownBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let lastOut = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      lastOut = (lastOut + 0.02 * w) / 1.02
      data[i] = lastOut * 3.5 // 提升音量
    }
    return buf
  }

  private startWhiteNoise(ctx: AudioContext): void {
    const src = ctx.createBufferSource()
    src.buffer = this.makeNoiseBuffer(ctx, 2)
    src.loop = true
    if (this.masterGain) src.connect(this.masterGain)
    src.start()
    this.nodes.push(src)
  }

  private startPinkNoise(ctx: AudioContext): void {
    const src = ctx.createBufferSource()
    src.buffer = this.makePinkBuffer(ctx, 4)
    src.loop = true
    if (this.masterGain) src.connect(this.masterGain)
    src.start()
    this.nodes.push(src)
  }

  private startBrownNoise(ctx: AudioContext): void {
    const src = ctx.createBufferSource()
    src.buffer = this.makeBrownBuffer(ctx, 4)
    src.loop = true

    // 加一点点 LFO 调制振幅,模拟海浪起伏
    const gain = ctx.createGain()
    gain.gain.value = 1
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.12 // 8 秒一周期,慢吞吞的呼吸
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.25
    lfo.connect(lfoGain).connect(gain.gain)
    lfo.start()

    src.connect(gain)
    if (this.masterGain) gain.connect(this.masterGain)
    src.start()
    this.nodes.push(src, lfo)
  }

  private startRain(ctx: AudioContext): void {
    // 底层：滤波白噪音模拟雨幕
    const noise = ctx.createBufferSource()
    noise.buffer = this.makeNoiseBuffer(ctx, 2)
    noise.loop = true

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 4500
    lp.Q.value = 0.7

    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 200

    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.7

    noise.connect(hp).connect(lp).connect(noiseGain)
    if (this.masterGain) noiseGain.connect(this.masterGain)
    noise.start()
    this.nodes.push(noise)

    // 顶层：随机的"叮"脉冲（雨滴打在物体上）
    const dropTimer = setInterval(() => {
      if (!this.ctx || !this.masterGain) return
      // 每秒 3-7 个雨滴
      const count = 3 + Math.floor(Math.random() * 5)
      for (let i = 0; i < count; i++) {
        const t0 = ctx.currentTime + Math.random() * 0.9
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(800 + Math.random() * 1500, t0)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, t0)
        g.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.04, t0 + 0.005)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08)
        osc.connect(g).connect(this.masterGain)
        osc.start(t0)
        osc.stop(t0 + 0.1)
      }
    }, 1000)
    this.timers.push(dropTimer)
  }

  private startFire(ctx: AudioContext): void {
    // 底层：低通白噪音
    const noise = ctx.createBufferSource()
    noise.buffer = this.makeNoiseBuffer(ctx, 2)
    noise.loop = true

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1800
    lp.Q.value = 0.5

    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.8

    noise.connect(lp).connect(noiseGain)
    if (this.masterGain) noiseGain.connect(this.masterGain)
    noise.start()
    this.nodes.push(noise)

    // 顶层：随机噼啪
    const crackleTimer = setInterval(() => {
      if (!this.ctx || !this.masterGain) return
      // 每 1.2 秒平均 1-2 个噼啪
      const count = Math.random() < 0.7 ? 1 + Math.floor(Math.random() * 2) : 0
      for (let i = 0; i < count; i++) {
        const t0 = ctx.currentTime + Math.random() * 1.0
        const burst = ctx.createBufferSource()
        burst.buffer = this.makeNoiseBuffer(ctx, 0.06)
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = 1500 + Math.random() * 2500
        bp.Q.value = 4
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, t0)
        g.gain.linearRampToValueAtTime(0.15 + Math.random() * 0.1, t0 + 0.005)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05 + Math.random() * 0.04)
        burst.connect(bp).connect(g).connect(this.masterGain)
        burst.start(t0)
        burst.stop(t0 + 0.1)
      }
    }, 1200)
    this.timers.push(crackleTimer)
  }

  private startHum(ctx: AudioContext): void {
    // 暖白噪音 = 低通粉红 + 极低 LFO 调制（模拟咖啡馆远处人声起伏）
    const src = ctx.createBufferSource()
    src.buffer = this.makePinkBuffer(ctx, 4)
    src.loop = true

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 600
    lp.Q.value = 0.7

    const gain = ctx.createGain()
    gain.gain.value = 1.2

    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.08
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.3
    lfo.connect(lfoGain).connect(gain.gain)
    lfo.start()

    src.connect(lp).connect(gain)
    if (this.masterGain) gain.connect(this.masterGain)
    src.start()
    this.nodes.push(src, lfo)
  }
}

export const ambientPlayer = new AmbientPlayer()

/* ─────────────────────────────────────────────────────
 * 完成时的清脆铃声（保持原有行为）
 * ─────────────────────────────────────────────────────*/

const CHIME_DATAURL =
  'data:audio/wav;base64,UklGRiQEAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAEAACAg4eKjpKVmJyfo6apra2vsLGxsbGwr66tq6moppOmZBpgWVlcXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5e'

let chimeAudio: HTMLAudioElement | null = null

export function playChime(volume = 0.5): void {
  try {
    if (!chimeAudio) {
      chimeAudio = new Audio(CHIME_DATAURL)
    }
    chimeAudio.volume = volume
    chimeAudio.currentTime = 0
    void chimeAudio.play().catch(() => {})
  } catch {
    // ignore
  }
}
