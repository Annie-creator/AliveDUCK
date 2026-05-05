/**
 * 环境音播放器(单例)。
 *
 * 6 个免费循环音(都来自 Pixabay,可商用免署名)+ B 站视频跳转支持。
 * 设计:把音频元素挂在全局,这样切页面/切组件不打断播放。
 */

export interface AmbientSoundOption {
  key: string
  name: string
  /** 直链 mp3,留空表示无声 */
  url: string
}

export const AMBIENT_SOUNDS: AmbientSoundOption[] = [
  { key: 'none', name: '纯净无声', url: '' },
  { key: 'rain', name: '雨声', url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_25c5ad3a48.mp3' },
  { key: 'cafe', name: '咖啡馆', url: 'https://cdn.pixabay.com/download/audio/2024/04/12/audio_56c14ace51.mp3' },
  { key: 'ocean', name: '海浪', url: 'https://cdn.pixabay.com/download/audio/2022/03/11/audio_c8e7fb8b8e.mp3' },
  { key: 'fire', name: '篝火', url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_2dde668b50.mp3' },
  { key: 'forest', name: '森林', url: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_efe7f29d9e.mp3' },
  { key: 'whitenoise', name: '白噪音', url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_94ba74dd75.mp3' },
]

/** 你 HTML 老版本里的 5 个 B 站视频 —— 保留 */
export const LEGACY_BILIBILI_BGM: Array<{ name: string; bvid: string }> = [
  { name: '八段锦', bvid: 'BV1gT4y1m7ec' },
  { name: '分列式进行曲(提神醒脑)', bvid: 'BV16NAEzkE4y' },
  { name: '寺庙梵音(冥想静心)', bvid: 'BV1dt42177V8' },
  { name: '红星闪闪(热血破冰)', bvid: 'BV1Fweyz8ENC' },
  { name: '夏日听雨', bvid: 'BV1ji4y1Y77p' },
]

class AmbientPlayer {
  private audio: HTMLAudioElement | null = null
  private currentKey: string = 'none'

  setSound(key: string, volume: number): void {
    if (key === this.currentKey) {
      if (this.audio) this.audio.volume = volume
      return
    }
    this.stop()
    this.currentKey = key

    const sound = AMBIENT_SOUNDS.find((s) => s.key === key)
    if (!sound || !sound.url) return

    this.audio = new Audio(sound.url)
    this.audio.loop = true
    this.audio.volume = volume
    void this.audio.play().catch(() => {
      // 自动播放被浏览器拦截时静默失败(用户互动后再次调用就行)
    })
  }

  setVolume(v: number): void {
    if (this.audio) this.audio.volume = v
  }

  pause(): void {
    if (this.audio && !this.audio.paused) this.audio.pause()
  }

  resume(): void {
    if (this.audio && this.audio.paused) {
      void this.audio.play().catch(() => {})
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause()
      this.audio.src = ''
      this.audio = null
    }
    this.currentKey = 'none'
  }

  isPlaying(): boolean {
    return this.audio !== null && !this.audio.paused
  }

  getCurrentKey(): string {
    return this.currentKey
  }
}

export const ambientPlayer = new AmbientPlayer()

/** 完成时的清脆铃声(直接从 base64 dataURL 内嵌,不依赖外网)*/
const CHIME_DATAURL =
  'data:audio/wav;base64,UklGRiQEAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAEAACAg4eKjpKVmJyfo6apra2vsLGxsbGwr66tq6moppOmZBpgWVlcXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5e'

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
