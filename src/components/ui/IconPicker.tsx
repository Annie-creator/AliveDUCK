import { useEffect, useRef, useState } from 'react'
import { Upload, RotateCcw, Check, X } from 'lucide-react'

/**
 * 图标选择器 —— App 图标 / 用户头像 通用。
 *
 * Staging 模式（Annie 要求的"确认按钮"）：
 *   - 内部 useState 暂存 draftEmoji / draftDataUrl
 *   - 改动只在内部生效,大预览实时反映 draft
 *   - 「保存」按钮才把 draft 写入 props 的 onEmojiChange / onDataUrlChange
 *   - 「取消」按钮把 draft 重置回 props 当前值
 *   - dirty 状态有视觉提示(预览框边框变 accent + 顶部 badge "未保存")
 *   - 保存成功短暂显示 ✓ 反馈
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
  defaultEmoji: string
  emojiSuggestions: string[]
  onEmojiChange: (emoji: string) => void
  onDataUrlChange: (dataUrl: string | null) => void
  onReset: () => void
  size?: number
  shape?: 'rounded' | 'circle'
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [draftEmoji, setDraftEmoji] = useState(emoji)
  const [draftDataUrl, setDraftDataUrl] = useState<string | null>(dataUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  // 当外部 props 变化时同步 draft（比如外部 reset 后）
  useEffect(() => {
    setDraftEmoji(emoji)
    setDraftDataUrl(dataUrl)
  }, [emoji, dataUrl])

  const dirty = draftEmoji !== emoji || draftDataUrl !== dataUrl
  const radius = shape === 'circle' ? '50%' : `${size * 0.22}px`

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    setUploading(true)
    try {
      const compressed = await compressImage(f, 256, 0.85)
      setDraftDataUrl(compressed)
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handleSave() {
    if (draftEmoji !== emoji) onEmojiChange(draftEmoji)
    if (draftDataUrl !== dataUrl) onDataUrlChange(draftDataUrl)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1500)
  }

  function handleCancel() {
    setDraftEmoji(emoji)
    setDraftDataUrl(dataUrl)
    setError(null)
  }

  function handleReset() {
    onReset()
    // 让 useEffect 同步 draft（reset 调用后 props 会变,触发同步）
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        {/* 大预览 —— dirty 时换 accent 边框 */}
        <div className="relative shrink-0">
          <div
            style={{
              borderRadius: radius,
              border: dirty
                ? '2px solid var(--bn-accent)'
                : '2px solid transparent',
              padding: 1,
              transition: 'border-color 0.2s',
            }}
          >
            <IconPreview
              emoji={draftEmoji}
              dataUrl={draftDataUrl}
              size={size}
              radius={radius}
            />
          </div>
          {dirty && (
            <span
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                background: 'var(--bn-accent)',
                color: 'var(--bn-button-fg)',
                fontSize: 9,
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 8,
                lineHeight: 1.4,
                whiteSpace: 'nowrap',
              }}
            >
              未保存
            </span>
          )}
          {justSaved && (
            <span
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                background: 'var(--bn-positive)',
                color: '#FFF',
                fontSize: 9,
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 8,
                lineHeight: 1.4,
              }}
            >
              ✓ 已保存
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* emoji 输入 */}
          <input
            type="text"
            value={draftEmoji}
            onChange={(e) => {
              const v = Array.from(e.target.value)[0] ?? ''
              if (v) {
                setDraftEmoji(v)
                // 选 emoji 时同步清掉 draft 上的图（emoji 优先）
                if (draftDataUrl) setDraftDataUrl(null)
              }
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
            {emojiSuggestions.map((e) => {
              const active = draftEmoji === e && !draftDataUrl
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setDraftEmoji(e)
                    if (draftDataUrl) setDraftDataUrl(null)
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md transition-all hover:scale-110"
                  style={{
                    fontSize: 16,
                    background: active ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                    border: `0.5px solid ${
                      active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'
                    }`,
                    lineHeight: 1,
                  }}
                >
                  {e}
                </button>
              )
            })}
          </div>
        </div>

        {/* 上传按钮 */}
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
            {uploading ? '处理中…' : draftDataUrl ? '换图' : '上传'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-white/5"
            style={{
              fontSize: 'var(--bn-text-xs)',
              color: 'var(--bn-text-tertiary)',
            }}
            title="恢复默认 emoji"
          >
            <RotateCcw size={10} strokeWidth={2} />
            默认
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {error && (
        <div
          className="mt-2"
          style={{ fontSize: 'var(--bn-text-xs)', color: 'var(--bn-negative)' }}
        >
          ⚠ {error}
        </div>
      )}

      {/* 保存 / 取消按钮 —— dirty 时凸显 */}
      <div
        className="mt-3 flex items-center gap-2"
        style={{
          opacity: dirty ? 1 : 0.4,
          transition: 'opacity 0.2s',
        }}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 transition-all disabled:cursor-not-allowed"
          style={{
            fontSize: 'var(--bn-text-sm)',
            background: dirty ? 'var(--bn-button-bg)' : 'var(--bn-glass)',
            color: dirty ? 'var(--bn-button-fg)' : 'var(--bn-text-tertiary)',
            fontWeight: 500,
          }}
        >
          <Check size={13} strokeWidth={2.4} />
          保存
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={!dirty}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 transition-colors hover:bg-white/5 disabled:cursor-not-allowed"
          style={{
            fontSize: 'var(--bn-text-sm)',
            color: 'var(--bn-text-tertiary)',
            border: '0.5px solid var(--bn-glass-border)',
          }}
        >
          <X size={13} strokeWidth={2.4} />
          取消
        </button>
        {!dirty && !justSaved && (
          <span
            style={{
              fontSize: 'var(--bn-text-xs)',
              color: 'var(--bn-text-tertiary)',
              fontStyle: 'italic',
            }}
          >
            （改动后再点保存）
          </span>
        )}
      </div>
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
          display: 'block',
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

  const ratio = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.round(img.width * ratio)
  const h = Math.round(img.height * ratio)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  return canvas.toDataURL('image/jpeg', quality)
}
