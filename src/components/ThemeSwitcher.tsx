import { THEME_META, THEME_ORDER, useTheme, type ThemeId } from '@/themes'
import { GlassPanel } from './ui/GlassPanel'
import { cn } from '@/lib/cn'

/**
 * 视觉化主题选择器:每个主题展示 3 个色块 + 名称 + 描述。
 * 用在设置页,但也可以放进任何位置。
 */
export function ThemeSwitcher() {
  const { themeId, setTheme, autoDark, setAutoDark } = useTheme()

  return (
    <div className="space-y-3">
      {THEME_ORDER.map((id) => (
        <ThemeOption
          key={id}
          id={id}
          active={!autoDark && id === themeId}
          onSelect={() => setTheme(id)}
        />
      ))}

      <label
        className="mt-2 flex cursor-pointer items-center justify-between rounded-xl px-3 py-3 transition-colors"
        style={{
          background: autoDark ? 'var(--bn-glass-strong)' : 'transparent',
          border: `0.5px solid ${autoDark ? 'var(--bn-glass-border)' : 'transparent'}`,
        }}
      >
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--bn-text-primary)' }}>
            跟随系统自动切换
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--bn-text-secondary)' }}>
            白天暖桃黄昏 · 夜晚夜色震金
          </p>
        </div>
        <input
          type="checkbox"
          checked={autoDark}
          onChange={(e) => setAutoDark(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-current"
          style={{ accentColor: 'var(--bn-accent)' }}
        />
      </label>
    </div>
  )
}

function ThemeOption({
  id,
  active,
  onSelect,
}: {
  id: ThemeId
  active: boolean
  onSelect: () => void
}) {
  const meta = THEME_META[id]
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all',
        'hover:translate-x-0.5',
        active ? 'bn-glass-strong' : 'bn-glass-thin',
      )}
      style={{
        boxShadow: active ? `0 0 0 1.5px var(--bn-accent) inset` : 'none',
      }}
    >
      <div className="flex shrink-0 gap-1">
        {meta.swatches.map((c, i) => (
          <span
            key={i}
            className="h-7 w-7 rounded-full"
            style={{
              background: c,
              boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.06)',
            }}
          />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          {meta.name}
        </p>
        <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--bn-text-secondary)' }}>
          {meta.description}
        </p>
      </div>
    </button>
  )
}

/**
 * 紧凑版主题切换器(只显示色块,横排),适合放在头部或其他狭窄位置。
 * 暂未使用,留给未来快速切换 UI。
 */
export function CompactThemeSwitcher() {
  const { themeId, setTheme } = useTheme()
  return (
    <GlassPanel padding="sm" radius="md" className="flex gap-2">
      {THEME_ORDER.map((id) => {
        const meta = THEME_META[id]
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            title={meta.name}
            className="h-6 w-6 rounded-full transition-transform hover:scale-110"
            style={{
              background: `linear-gradient(135deg, ${meta.swatches[0]} 0%, ${meta.swatches[1]} 50%, ${meta.swatches[2]} 100%)`,
              boxShadow:
                themeId === id
                  ? `0 0 0 2px var(--bn-accent), inset 0 0 0 1px rgba(255,255,255,0.4)`
                  : `inset 0 0 0 0.5px rgba(0,0,0,0.1)`,
            }}
          />
        )
      })}
    </GlassPanel>
  )
}
