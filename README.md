# 板鸭留子 Alive

留学生活的本地优先 Web 应用。一个人在西班牙的日子,所有数据都在你自己手里。

记账、日历、习惯、日记、食谱、购物 —— 在浏览器里离线可用,登录后跨设备自动同步。

## 技术栈

- **前端**:Vite + React 18 + TypeScript + Tailwind
- **本地存储**:IndexedDB (Dexie.js)
- **云端**:Supabase (Postgres + Auth + Realtime + RLS)
- **图表**:Recharts
- **Excel**:SheetJS

## 本地运行

需要 Node.js 18+ 和 npm。

```bash
git clone <your-github-repo-url>
cd banya-alive
npm install
cp .env.example .env.local
# 编辑 .env.local 填入 Supabase URL 和 anon key
npm run dev
```

打开 <http://localhost:5173>。

第一次配置 Supabase 看 [`supabase/README.md`](./supabase/README.md)。

## Vercel 部署(免费,推荐)

部署到 Vercel 后,你可以在手机/平板/任何设备上打开 <https://你的-app.vercel.app> 直接用,
不再需要本地 dev server。

### 步骤

1. 把代码推到 GitHub(本仓库)
2. 进 [vercel.com](https://vercel.com) → 用 GitHub 账号登录
3. 点 **Add New → Project** → 选你的 banya-alive 仓库
4. **Environment Variables** 区域加两个变量(同 `.env.local` 里的):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. 点 Deploy,等 1-2 分钟

之后每次 `git push` 到 main 分支,Vercel 自动重新部署,几秒后线上即可看到。

## 日常更新流程

我(Claude)开发的代码会以 zip 形式给你。你只需:

1. 解压覆盖到这个目录(`.env.local` 受 `.gitignore` 保护,不会被 zip 影响)
2. **双击根目录的 `push-to-github.bat`** —— 自动 add / commit / push,完成后弹 Vercel

```bash
# 或者手动 3 条命令(等价)
git add .
git commit -m "你的消息"
git push
```

线上版本(Vercel)会自动跟随 git push 更新,完全无需操作。

## 项目结构

```
src/
├── App.tsx                 # 路由 + 全局 Providers
├── auth/                   # Supabase 登录认证
├── components/             # UI 组件
│   ├── ui/                 # Button / GlassPanel / Input 等基础件
│   └── finance/            # 记账模块的图表、表单
├── db/                     # Dexie 数据库定义
├── lib/                    # 业务逻辑(同步引擎、智能归类、Excel 导入导出…)
├── pages/                  # Dashboard / Finance / Analytics / Settings
├── repositories/           # 数据访问层(BaseRepository 自动管理同步元字段)
├── themes/                 # 5 套玻璃拟态主题
└── types/                  # TypeScript 类型

supabase/
├── README.md               # Supabase 项目搭建指南
└── migrations/
    └── 0001_initial.sql    # 15 张表 + RLS + Realtime publication

```

## 开发哲学

- **Local-first**:数据先写本地 IndexedDB,后台异步同步到云
- **离线可用**:网络中断继续记账,联网自动追平
- **隐私优先**:Supabase RLS 确保你的数据只有你能看;anon key 暴露给前端是安全的
- **一份数据源**:所有 UI 用 `useLiveQuery` 订阅 IndexedDB,无需手动通知刷新

## 路线图

- [x] **Phase 1** · 数据层骨架 + 5 主题 + 老 JSON 导入
- [x] **Phase 2** · Supabase Auth + 行级安全
- [x] **Phase 3** · 自动同步引擎(防抖推送 + Realtime + 离线追平)
- [x] **Phase 4** · 多维度分析 + 智能归类 + 多币种 + Excel 导入导出
- [ ] **Phase 5** · 日历 + 番茄钟 + 习惯打卡 + 日记 + 食谱
- [ ] **Phase 6** · PWA + GDPR 数据出口 + 字段级冲突解决
