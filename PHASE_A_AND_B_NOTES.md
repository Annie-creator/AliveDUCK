# 板鸭留子 AliveDUCK · Phase A + B 完整交付

> 本批改动覆盖 8 项任务：字体 / 顶部导航 / 移动端抽屉 / 通用列表行 / 交易列表 / 启动欢迎页 / 时间问候 / 八段锦 / 完成动画 / 支出高亮 / 品牌字 → AliveDUCK
>
> 完成时间：2026-05-06
> 通过 `tsc -b --noEmit` 编译

---

## 一、文件清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `package.json` | 改 | 新增 framer-motion / lucide-react |
| `src/index.css` | 改 | 字体 token + 渐变文字工具类 |
| `src/App.tsx` | 改 | 顶导航 + 移动端汉堡 + 嵌入欢迎页/CelebrateHost · **品牌字 AliveDUCK** |
| `src/components/ui/ListRow.tsx` | 新 | 通用列表行组件 |
| `src/components/ui/AppDrawer.tsx` | 新 | 移动端侧拉抽屉 |
| `src/components/onboarding/WelcomeSplash.tsx` | 新 | 启动欢迎页（中/英/西/法 + spring + 渐变） |
| `src/components/onboarding/GreetingCard.tsx` | 新 | 5 时段问候卡 |
| `src/components/onboarding/BaduanjinCard.tsx` | 新 | 八段锦每日提醒 |
| `src/components/onboarding/Celebrate.tsx` | 新 | 完成动画 L1/L2/L3 |
| `src/lib/preferences.ts` | 新 | UI 偏好 store（支出高亮等） |
| `src/lib/baduanjin.ts` | 新 | 八段锦完成记录 store |
| `src/pages/DashboardPage.tsx` | 改 | 嵌入 GreetingCard + BaduanjinCard |
| `src/pages/FinancePage.tsx` | 改 | 用 ListRow + 支出高亮 |
| `src/pages/SettingsPage.tsx` | 改 | 加支出高亮开关 |

其他文件不动。

---

## 二、应用步骤

```bash
# 1. 解压 phase-a-and-b.zip 到项目根目录,覆盖同名文件
# 2. 装新依赖
npm install
# 3. 本地起来看
npm run dev
```

新增依赖：
- `framer-motion@^11.11.0`
- `lucide-react@^0.453.0`

---

## 三、改动重点

### 1. 品牌字 → **AliveDUCK** ✓

顶部和侧拉抽屉都用 mono 字体（JetBrains Mono）的 700 字重显示 `AliveDUCK`，前面带 🦆 emoji。
mono 字体 + 大写后两位 = 既有"代码 / 极客感"又有"鸭"的可爱。

### 2. 启动欢迎页（WelcomeSplash）

复刻老 HTML 的 `#os-boot-screen`：
- 全屏渐变文字（orange → pink → purple → sky）
- spring 弹起动画 + 3s 渐变流动循环
- **多语言自动切换**（按 `navigator.language`）
  - 中 zh-CN：早上好鸭~ / 欢迎回来 / 晚上好呀
  - 英 en：Good morning / Welcome back / Good evening
  - 西 es：Buenos días / Hola de nuevo / Buenas noches
  - 法 fr：Bonjour / Te revoilà / Bonsoir
- 副标"留学第 N 天"（如果设置了入境日则显示）
- 触发：每天首次访问 OR 距上次 > 6 小时
- 1.8s 自动消失或点任意处跳过

### 3. 时间问候卡（GreetingCard）

放在 Dashboard 顶部，5 时段：
- **5-10**：☕ 早安 + 杯口轻烟（垂直漂浮）
- **10-14**：☀️ 午好 + 太阳缓慢自转
- **14-18**：🌤️ 下午好 + 云朵漂动
- **18-22**：🌙 晚上好 + 月光呼吸
- **22-5**：✨ 夜深了 + 星星闪烁

右侧（桌面端）显示完整日期 + "留学 D{N}"。

### 4. 八段锦卡（BaduanjinCard）

- **早晨 8:00-10:00 之间打开 Dashboard 显示**
- 每天**只显示 1 个动作**（按周一→周日循环到第 7 式，周日加餐第 8 式）
- 完整动作名 + 一句功效（双手托天理三焦 / 舒展三焦·改善肩颈僵硬）
- 复刻老 HTML 的金句："身体是革命的本钱,先来活动一下筋骨吧 ✨"
- **「现在开始 · 12 分钟」按钮** → 跳转 `https://www.bilibili.com/video/BV1gT4y1m7ec`（国家体育总局演示版，从老 HTML 扒出来的 BV 号）
- **「稍后再说」** → 今日不再弹
- **完成记录**：累计天数 + 连续打卡天数（streak >1 天显示 🔥）
- **完成后折叠**：变成一行小条 "今日八段锦已完成 · 连续 N 天 · 累计 X"

数据存在 localStorage，不进 IndexedDB（不需要走同步）。

### 5. 完成动画统一语言（Celebrate）

三档强度，用一个全局 API：
```ts
import { fireCelebrate } from '@/components/onboarding/Celebrate'

fireCelebrate(1)                                  // 轻：按钮内嵌对勾
fireCelebrate(2)                                  // 中：12 粒子 + 大对勾
fireCelebrate(3, '🍅 一个番茄完成!')               // 重：全屏 + 24 粒子 + 文案
```

`CelebrateHost` 已经在 App 顶层挂载，全 app 任意位置 import 调用即可。

后续接入位置（需要在调用方加一行）：
- 加交易成功 → `fireCelebrate(1)`（QuickEntryForm 里）
- 习惯打卡 → `fireCelebrate(2)`
- 番茄钟完成 → `fireCelebrate(3, '🍅 一个番茄完成')`
- 日记保存 → `fireCelebrate(1)`

### 6. 一键支出高亮 ✓

在 设置 → 外观 多了一个开关：
- 关闭（默认）：支出金额用主文字色，日常记账不刺眼
- 开启：所有支出金额变红色 `var(--bn-negative)`，警觉模式

开关旁有**实时预览**（−€ 13.45 / +€ 1,850.00），点了立刻看到效果。

### 7. 顶部导航 + 抽屉（Phase A）

- 桌面端 7 项全平铺 + Lucide 图标，不再有"更多 ▾"
- 移动端 280px 侧拉抽屉，含：用户身份 / 7 个菜单 / 5 主题快切色块 / 同步徽章 / 版本号
- 拖拽收起（往右拖 > 90px 自动关）

### 8. 通用列表行 + 交易列表（Phase A）

- ListRow 三列严格对齐（leading / title+subtitle / trailing）
- iOS 风划删：左划 -88px 露出红色删除区
- 字号 16px / 字重 500 / mono 600，金额栏严格右对齐

---

## 四、Phase C 还会做什么

剩下 1 项：
- **PomodoroPanel + PiP 浮窗重做**

涉及：
- 主面板大数字字体升级（用 .bn-mono-display）
- 进度从条状 → 5+5 个圆点
- 完成时触发 `fireCelebrate(3, '🍅 一个番茄完成')`
- PiP 浮窗内部 HTML/CSS 重写（满铺、零边距、磨砂玻璃）

---

## 五、几点你可能想知道的小决定

1. **「现在开始」按钮点了立刻标记为今日已完成** ——
   理由：用户点开 = 有意识在做。如果你嫌不严格（"我点了但没看完"），可以改成"看完 12 分钟回到 app 才标完成"，但那需要复杂的时长追踪。建议保持现在的方式。

2. **多语言只影响欢迎页** —— Dashboard 的"早安"、八段锦提示等都还是中文。
   理由：Annie 是中文用户，整个 app 中文是默认。欢迎页的多语言更多是"国际气质"装饰，不是真正的 i18n。如果你需要全 app i18n（西/法切换），那是 Phase D 的事。

3. **八段锦记录不进数据库** ——
   理由：每天 1 条记录，不需要跨设备同步（个人晨练，本地即可）。如果你想让习惯打卡和八段锦合并、走数据库，告诉我，我把它接到 `habits` + `habit_logs` 表。

4. **欢迎页冷却时间是 6 小时** —— 你早上 8 点打开看一次，下午 2 点再打开就不会再弹。如果你想要「每天最多看一次」，把 `COOLDOWN_MS` 改成 24 小时即可。

5. **fireCelebrate 还没接到任何实际事件** —— 我只是把基础设施做好。需要我顺便把"加交易成功 / 番茄钟完成"等事件接上吗？还是 Phase C 一起做？

随时反馈。
