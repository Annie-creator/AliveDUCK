import { useRef, useState } from 'react'
import { Upload, Trash2 } from 'lucide-react'

/**
 * 图标选择器 —— App 图标 / 用户头像 通用。
 *
 * 设计：
 *   - 大预览方框：优先显示 dataUrl（用户上传的图片）,否则用 emoji 渲染在渐变背景上
 *   - emoji 输入：用户键入或粘贴一个 emoji,立即生效
 *   - emoji 快速候选：常用 emoji 一行 chip
 *   - 上传图片：< 入口,自动压缩到 256x256 JPEG 控制 dataURL 体积
 *   - 重置/移除：清掉 dataUrl 或恢复默认 emoji
 *
 * 图片压缩用 Canvas API,无外部依赖。
 */
export function IconPicker({
  emoji,
  dataUrl,
  defaultEmoji,
  emojiSuggestions,
  onEmojiChange,
  onDataUrlChange,
  onReset,
  size = 64,
  shape = 'rounded',
}: {
  emoji: string
  dataUrl: string | null
  /** "重置"按钮恢复到这个 emoji */
  defaultEmoji: string
  emojiSuggestions: string[]
  onEmojiChange: (emoji: string) => void
  onDataUrlChange: (dataUrl: string | null) => void
  onReset: () => void
  size?: number
  shape?: 'rounded' | 'circle'
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    setUploading(true)
    try {
      const compressed = await compressImage(f, 256, 0.85)
      onDataUrlChange(compressed)
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
      // 清空 input 让同一个文件可以重选
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const radius = shape === 'circle' ? '50%' : `${size * 0.22}px`

  return (
    <div className="flex items-center gap-3">
      {/* 预览 */}
      <IconPreview
        emoji={emoji}
        dataUrl={dataUrl}
        size={size}
        radius={radius}
      />

      <div className="min-w-0 flex-1">
        {/* emoji 输入 */}
        <input
          type="text"
          value={emoji}
          onChange={(e) => {
            // 取第一个 emoji/字符,UTF-16 surrogate-aware
            const v = Array.from(e.target.value)[0] ?? ''
            if (v) onEmojiChange(v)
          }}
          maxLength={4}
          placeholder={defaultEmoji}
          className="block w-20 rounded-lg px-2 py-1 text-center"
          style={{
            fontSize: 22,
            background: 'var(--bn-glass)',
            border: '0.5px solid var(--bn-glass-border)',
            color: 'var(--bn-text-primary)',
            lineHeight: 1.4,
          }}
        />
        {/* emoji 候选 */}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {emojiSuggestions.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onEmojiChange(e)
                // 选 emoji 时如果有上传图,问要不要去掉
                if (dataUrl) onDataUrlChange(null)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md transition-all hover:scale-110"
              style={{
                fontSize: 16,
                background:
                  emoji === e && !dataUrl ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                border: `0.5px solid ${
                  emoji === e && !dataUrl
                    ? 'var(--bn-accent)'
                    : 'var(--bn-glass-border)'
                }`,
                lineHeight: 1,
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* 操作按钮组 */}
      <div className="flex shrink-0 flex-col gap-1">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-white/5 disabled:opacity-50"
          style={{
            fontSize: 'var(--bn-text-xs)',
            color: 'var(--bn-text-secondary)',
            border: '0.5px solid var(--bn-glass-border)',
          }}
        >
          <Upload size={11} strokeWidth={2} />
          {uploading ? '处理中…' : dataUrl ? '换图' : '上传'}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-white/5"
          style={{
            fontSize: 'var(--bn-text-xs)',
            color: 'var(--bn-text-tertiary)',
          }}
          title="重置为默认"
        >
          <Trash2 size={10} strokeWidth={2} />
          重置
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />

      {error && (
        <div
          className="absolute mt-1"
          style={{ fontSize: 'var(--bn-text-xs)', color: 'var(--bn-negative)' }}
        >
          {error}
        </div>
      )}
    </div>
  )
}

/** 把当前图标渲染出来 —— 优先 dataUrl,否则 emoji + 渐变背景 */
export function IconPreview({
  emoji,
  dataUrl,
  size,
  radius,
}: {
  emoji: string
  dataUrl: string | null
  size: number
  radius: string
}) {
  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        alt="icon"
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: 'cover',
          flexShrink: 0,
          border: '0.5px solid var(--bn-glass-border)',
        }}
      />
    )
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: 'linear-gradient(135deg, #FFB07A 0%, #FF8A95 55%, #E78AB8 100%)',
        fontSize: size * 0.55,
        lineHeight: 1,
      }}
    >
      {emoji}
    </div>
  )
}

/**
 * 用 Canvas 把图片压缩到目标边长内（保持比例）,输出 JPEG dataURL。
 */
async function compressImage(
  file: File,
  maxSize: number,
  quality: number,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('图片太大(>10MB),请先压缩')
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('读取失败'))
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('图片加载失败'))
    i.src = dataUrl
  })

  // 计算目标尺寸
  const ratio = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.round(img.width * ratio)
  const h = Math.round(img.height * ratio)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  // 平滑缩放
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  return canvas.toDataURL('image/jpeg', quality)
}
