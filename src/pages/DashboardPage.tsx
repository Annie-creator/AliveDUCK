import { GlassPanel } from '@/components/ui/GlassPanel'

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

      <GlassPanel padding="lg" radius="lg">
        <h2 className="mb-3 text-base font-medium" style={{ color: 'var(--bn-text-primary)' }}>
          Phase 4 已就位
        </h2>
        <ul className="space-y-2 text-sm" style={{ color: 'var(--bn-text-secondary)' }}>
          <Item label="Vite + React + TypeScript + Tailwind 工作中" />
          <Item label="Dexie 13 张表 + 5 主题切换 + Madrid 天际线主题" />
          <Item label="Supabase Auth + 自动同步引擎(防抖推送 + Realtime + 离线追平)" />
          <Item label="Excel 账本导入/导出(SheetJS · 8 张工作表)" />
          <Item label="智能商家归类(Mercadona→食杂,Renfe→交通…可学习)" />
          <Item label="多维度分析(分类环形图 / Top 商家 / 月度趋势)" />
          <Item label="多币种 + 历史汇率快照(EUR / CNY / USD 同表统计)" />
          <Item label="月度预算 + 进度条 + 日均还能花" />
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
          <Phase n={5} title="日历 + 番茄钟 + 习惯打卡 + 日记 + 食谱" />
          <Phase n={6} title="PWA + 部署 + GDPR 出口 + 字段级冲突解决" />
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
