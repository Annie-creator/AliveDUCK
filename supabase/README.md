# Supabase 配置指南

板鸭留子 Alive 用 Supabase 做账号系统 + 云端备份。完成本指南大约 5 分钟。

## 一、创建免费项目

1. 打开 [supabase.com](https://supabase.com) → Sign up(GitHub 登录最快)
2. New project → 选一个 region(欧洲就选 Frankfurt;国内访问建议 Tokyo)
3. 设一个数据库密码,随便存一份(几乎用不到)
4. 等 1-2 分钟创建完成

## 二、运行建表 SQL

1. 项目首页左侧导航 → SQL Editor
2. 点 + New query
3. 打开本仓库的 `supabase/migrations/0001_initial.sql`,**整段**复制粘贴
4. 右下角点 Run(或 Ctrl/Cmd + Enter)

成功标志:右下角弹 "Success. No rows returned"。
失败如果报"already exists",说明你已经跑过了——SQL 写成幂等的,可以重跑没问题。

> **如果你之前跑过 Phase 2 的 SQL**:Phase 3 在末尾追加了 Realtime publication 配置。
> 直接整段重跑一次(幂等的),自动同步才能工作。

## 三、拿到 URL 和 anon key

> 注意:Supabase 2025 年改版了 Dashboard,把 "Project Settings → API" 拆成了
> "Data API"(放 URL)和 "API Keys"(放 keys)两个 tab。

**最快的方法**:点顶部的 **Connect** 按钮(搜索框右边),弹出对话框就直接显示 URL + key,一键复制。

**或者直接进设置页**:
- URL:左下角齿轮 → **Project Settings** → **Data API** → 顶部的 Project URL
- Key:左下角齿轮 → **Project Settings** → **API Keys** → 选下面任意一个:
  - **Publishable key**(`sb_publishable_xxx`)—— 新版,推荐
  - 或切到 **Legacy API Keys** tab,复制 **anon public**(`eyJhbGc...`)

**两种 key 都能用**,SDK 兼容。**绝对不要**用 `service_role` 或 secret key —— 那是后端用的。

## 四、填入 .env.local

在项目根目录(和 package.json 同级)新建一个 `.env.local` 文件,内容:

```
VITE_SUPABASE_URL=粘你的 URL
VITE_SUPABASE_ANON_KEY=粘你的 anon key
```

**注意**:这两个值是公开的,放前端没问题——真正的数据隔离靠 RLS 行级策略,SQL 已经全部建好。

## 五、重启 dev server

```bash
# 终止之前的 npm run dev,重新跑
npm run dev
```

打开 settings 页,顶部应该看到登录卡片(而不是"未配置"提示)。

## 六、注册第一个账号

1. Settings 页 → 注册账号 → 填邮箱密码
2. 去你的邮箱确认链接(默认 Supabase 要邮箱验证)
3. 回来登录

> 不想要邮箱验证(自己一个人用)?可以去 Supabase Dashboard → Authentication → Providers → Email → 关掉 "Confirm email"。

## 七、验证 RLS 真的在保护你

登录后去 Supabase Dashboard → Table Editor → `finance_transactions`。

- 你应该能看到自己的数据(如果上传过)
- 但即便另一个人有你的 anon key,他用自己账号登录也**看不到你的行**——RLS 在数据库层强制隔离

## 故障排查

| 现象 | 可能原因 |
|---|---|
| Settings 页提示"未配置" | `.env.local` 没创建,或文件名拼错(注意是 `.local` 不是 `.example`),或没重启 dev server |
| 注册后收不到邮件 | 检查垃圾邮件箱;或在 Supabase Dashboard → Authentication → Email Templates 里看默认模板是否被禁用了 |
| 上传时 "permission denied for table" | RLS 策略没装好,回到 SQL Editor 重跑一次 `0001_initial.sql` |
| 上传时 "violates foreign key constraint" | 老的本地数据带了 `category_id` 但没相应的 category 行。Phase 3 会处理依赖顺序;Phase 2 暂时可以先跑 `promoteGuestData` 再 upload |

## Phase 3 已开启:全自动同步

写一笔账,几秒后另一台设备自动看到。设计:
- 写操作 → 防抖 800ms → 批量推送
- Realtime channel 实时推送变更
- 离线继续记账,联网后自动追平
- 失败指数退避重试(2s, 5s, 15s, 60s, 5min)

依然需要的"手动"操作只剩:
- 第一次登录(注册/登录)
- 不同 Supabase 项目之间迁移(几乎不会发生)
