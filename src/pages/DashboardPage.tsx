import { GlassPanel } from '@/components/ui/GlassPanel'
import { DataMaintenanceCard } from '@/components/DataMaintenanceCard'
import { GreetingCard } from '@/components/onboarding/GreetingCard'
import { BaduanjinCard } from '@/components/onboarding/BaduanjinCard'

export function DashboardPage() {
  return (
    <div className="space-y-5">
      {/* 时间问候卡（顶部第一眼） */}
      <GreetingCard />

      {/* 八段锦卡（仅 8-10 点显示，今日已做则折叠） */}
      <BaduanjinCard />

      {/* 检测到脏数据时才显示;干净就完全隐身 */}
      <DataMaintenanceCard />

      <GlassPanel padding="lg" radius="lg">
        <h2
          className="mb-3"
          style={{
            fontSize: 'var(--bn-text-md)',
            fontWeight: 600,
            color: 'var(--bn-text-primary)',
            letterSpacing: '-0.015em',
          }}
        >
          AliveDUCK · Phase 6 已就位
        </h2>
        <ul
          className="space-y-2"
          style={{ fontSize: 'var(--bn-text-sm)', color: 'var(--bn-text-secondary)' }}
        >
          <Item label="💰 完整记账 · 行可点编辑 · 左滑删除 · Excel 导入导出" />
          <Item label="📊 多维度分析 · 趋势 / 分类 / 商家 / 预算" />
          <Item label="📅 日历 · 月视图标题 + 周视图 + 重复事件 + 浏览器提醒" />
          <Item label="🍅 番茄钟 · Web Worker · 画中画浮窗 · 环境音" />
          <Item label="☑️ 习惯打卡 + 月历热图 + 连续天数" />
          <Item label="📓 日记 · 心情 · 全文搜索" />
          <Item label="🍳 食谱 → 🛒 购物 → 📦 库存 · 三向打通" />
          <Item label="🌅 八段锦每日提醒 · 国家体育总局 12 分钟模式" />
          <Item label="自动同步 · 多设备实时 · 5 主题" />
        </ul>
      </GlassPanel>

      <GlassPanel padding="lg" radius="lg">
        <h2
          className="mb-3"
          style={{
            fontSize: 'var(--bn-text-md)',
            fontWeight: 600,
            color: 'var(--bn-text-primary)',
            letterSpacing: '-0.015em',
          }}
        >
          路线图
        </h2>
        <ol
          className="space-y-2"
          style={{
            fontSize: 'var(--bn-text-sm)',
            color: 'var(--bn-text-secondary)',
            listStyle: 'none',
            padding: 0,
          }}
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
        className="bn-mono shrink-0"
        style={{
          fontSize: 'var(--bn-text-xs)',
          fontWeight: 600,
          color: 'var(--bn-text-tertiary)',
        }}
      >
        Phase {n}
      </span>
      <span>{title}</span>
    </li>
  )
}
