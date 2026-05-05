import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataMaintenanceCard } from '@/components/DataMaintenanceCard'

export function DashboardPage() {
  return (
    <div className="space-y-5">
      <div>
        <p
          className="mb-1.5 text-[11px] font-medium tracking-[0.06em] uppercase"
          style={{ color: 'var(--bn-text-secondary)' }}
        >
          板鸭留子 Alive · v0.1
        </p>
        <h1
          className="text-[30px] leading-[1.15]"
          style={{
            color: 'var(--bn-text-primary)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
          }}
        >
          欢迎回来
          <span
            className="ml-2"
            style={{
              color: 'var(--bn-text-tertiary)',
              fontWeight: 300,
              letterSpacing: '-0.02em',
            }}
          >
            今日继续 alive
          </span>
        </h1>
      </div>

      {/* 检测到脏数据时才显示;干净就完全隐身 */}
      <DataMaintenanceCard />

      <GlassPanel padding="lg" radius="lg">
        <h2 className="mb-3 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          Phase 5b 已就位
        </h2>
        <ul className="space-y-2 text-sm" style={{ color: 'var(--bn-text-secondary)' }}>
          <Item label="💰 完整记账 · 行可点编辑 · Excel 导入导出" />
          <Item label="📊 多维度分析 · 趋势 / 分类 / 商家 / 预算" />
          <Item label="📅 日历 · 月视图标题 + 周视图 + 重复事件 + 浏览器提醒" />
          <Item label="🍅 番茄钟 · Web Worker · 画中画浮窗 · 环境音" />
          <Item label="☑️ 习惯打卡 + 月历热图 + 连续天数" />
          <Item label="📓 日记 · 心情 · 全文搜索" />
          <Item label="🍳 食谱 → 🛒 购物 → 📦 库存 · 三向打通" />
          <Item label="自动同步 · 多设备实时 · 5 主题" />
        </ul>
      </GlassPanel>

      <GlassPanel padding="lg" radius="lg">
        <h2 className="mb-3 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          路线图
        </h2>
        <ol
          className="space-y-2 text-sm"
          style={{ color: 'var(--bn-text-secondary)', listStyle: 'none', padding: 0 }}
        >
          <Phase n={6} title="PWA · 离线安装 · 推送通知 · 字段级冲突解决" />
          <Phase n={7} title="数据导出 / GDPR · 备份恢复 · 端到端加密" />
        </ol>
      </GlassPanel>
    </div>
  )
}

function Item({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: 'var(--bn-positive)' }}
      />
      <span>{label}</span>
    </li>
  )
}

function Phase({ n, title }: { n: number; title: string }) {
  return (
    <li className="flex items-baseline gap-3">
      <span
        className="bn-mono shrink-0 text-xs font-medium"
        style={{ color: 'var(--bn-text-tertiary)' }}
      >
        Phase {n}
      </span>
      <span>{title}</span>
    </li>
  )
}
