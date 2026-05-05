-- ============================================================================
-- 板鸭留子 Alive — 初始 schema
-- 在 Supabase Dashboard → SQL Editor 里整段执行一次即可
-- ============================================================================

-- ─── 工具函数 ──────────────────────────────────────────────────────────
-- 自动维护 updated_at:任何 UPDATE 都把它刷成 now()
create or replace function bn_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc', now())::text;
  return new;
end $$;

-- ─── 通用列宏(避免每张表重复 13 行)───────────────────────────────
-- 由于 SQL 不支持真正的"列宏",这里手动列出每张表都必有的同步元字段。
-- 修改时各表保持一致(这是 Phase 1 BaseRepository 的镜像)。

-- ─── 表 1:accounts ─────────────────────────────────────────────────
create table if not exists public.accounts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  -- 业务字段
  name text not null,
  type text not null,
  currency text not null,
  initial_balance numeric not null default 0,
  icon text not null default '',
  color text not null default '',
  sort_order int not null default 0,
  archived boolean not null default false
);
create index if not exists accounts_user_idx on public.accounts(user_id);
create index if not exists accounts_updated_idx on public.accounts(user_id, updated_at);

-- ─── 表 2:categories ───────────────────────────────────────────────
create table if not exists public.categories (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  name text not null,
  kind text not null check (kind in ('income','expense')),
  icon text not null default '',
  color text not null default '',
  sort_order int not null default 0,
  parent_id uuid,
  archived boolean not null default false
);
create index if not exists categories_user_idx on public.categories(user_id);
create index if not exists categories_updated_idx on public.categories(user_id, updated_at);

-- ─── 表 3:finance_transactions ─────────────────────────────────────
create table if not exists public.finance_transactions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  type text not null check (type in ('income','expense','transfer')),
  occurred_at text not null,
  amount numeric not null,
  currency text not null default 'EUR',
  exchange_rate numeric not null default 1,
  category_id uuid,
  from_account_id uuid,
  to_account_id uuid,
  participant text not null default '',
  note text not null default '',
  tag_ids jsonb not null default '[]'::jsonb
);
create index if not exists finance_user_occurred_idx on public.finance_transactions(user_id, occurred_at desc);
create index if not exists finance_updated_idx on public.finance_transactions(user_id, updated_at);

-- ─── 表 4:budgets ─────────────────────────────────────────────────
create table if not exists public.budgets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  month text not null,
  category_id uuid,
  amount numeric not null,
  currency text not null default 'EUR'
);
create index if not exists budgets_user_idx on public.budgets(user_id);
create index if not exists budgets_updated_idx on public.budgets(user_id, updated_at);

-- ─── 表 5:tags ────────────────────────────────────────────────────
create table if not exists public.tags (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  name text not null,
  color text not null default ''
);
create index if not exists tags_user_idx on public.tags(user_id);
create index if not exists tags_updated_idx on public.tags(user_id, updated_at);

-- ─── 表 6:calendar_events ─────────────────────────────────────────
create table if not exists public.calendar_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  title text not null,
  description text not null default '',
  start_at text not null,
  end_at text not null,
  all_day boolean not null default false,
  location text not null default '',
  tag_ids jsonb not null default '[]'::jsonb,
  reminders_minutes jsonb not null default '[]'::jsonb,
  recurrence jsonb
);
-- Phase 5b 给已存在的表追加 recurrence 列(幂等)
alter table public.calendar_events add column if not exists recurrence jsonb;
create index if not exists calendar_user_start_idx on public.calendar_events(user_id, start_at);
create index if not exists calendar_updated_idx on public.calendar_events(user_id, updated_at);

-- ─── 表 7:focus_sessions ──────────────────────────────────────────
create table if not exists public.focus_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  started_at text not null,
  ended_at text,
  duration_seconds int not null default 0,
  linked_event_id uuid,
  linked_habit_id uuid,
  note text not null default '',
  tag_ids jsonb not null default '[]'::jsonb
);
create index if not exists focus_user_started_idx on public.focus_sessions(user_id, started_at desc);
create index if not exists focus_updated_idx on public.focus_sessions(user_id, updated_at);

-- ─── 表 8:journals ────────────────────────────────────────────────
create table if not exists public.journals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  title text not null default '',
  content text not null default '',
  image_urls jsonb not null default '[]'::jsonb,
  mood text,
  tag_ids jsonb not null default '[]'::jsonb
);
create index if not exists journals_user_created_idx on public.journals(user_id, created_at desc);
create index if not exists journals_updated_idx on public.journals(user_id, updated_at);

-- ─── 表 9:recipes ─────────────────────────────────────────────────
create table if not exists public.recipes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  name text not null,
  description text not null default '',
  servings int not null default 1,
  instructions text not null default '',
  cover_image_url text,
  tag_ids jsonb not null default '[]'::jsonb
);
create index if not exists recipes_user_idx on public.recipes(user_id);
create index if not exists recipes_updated_idx on public.recipes(user_id, updated_at);

-- ─── 表 10:recipe_items ───────────────────────────────────────────
create table if not exists public.recipe_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  recipe_id uuid not null,
  ingredient_name text not null,
  quantity numeric not null default 1,
  unit text not null default ''
);
create index if not exists recipe_items_user_idx on public.recipe_items(user_id);
create index if not exists recipe_items_recipe_idx on public.recipe_items(recipe_id);
create index if not exists recipe_items_updated_idx on public.recipe_items(user_id, updated_at);

-- ─── 表 11:shopping_items ─────────────────────────────────────────
create table if not exists public.shopping_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  name text not null,
  category text not null default '',
  quantity numeric not null default 1,
  unit text not null default '',
  done boolean not null default false,
  done_at text,
  auto_to_pantry boolean not null default false,
  note text not null default '',
  tag_ids jsonb not null default '[]'::jsonb
);
create index if not exists shopping_user_done_idx on public.shopping_items(user_id, done);
create index if not exists shopping_updated_idx on public.shopping_items(user_id, updated_at);

-- ─── 表 12:pantry_items ───────────────────────────────────────────
create table if not exists public.pantry_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  name text not null,
  category text not null default '',
  quantity numeric not null default 0,
  unit text not null default '',
  low_threshold numeric not null default 1,
  expires_on text,
  note text not null default '',
  tag_ids jsonb not null default '[]'::jsonb
);
create index if not exists pantry_user_idx on public.pantry_items(user_id);
create index if not exists pantry_updated_idx on public.pantry_items(user_id, updated_at);

-- ─── 表 13:habits ─────────────────────────────────────────────────
create table if not exists public.habits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  name text not null,
  description text not null default '',
  icon text not null default '',
  color text not null default '',
  days_of_week jsonb not null default '[]'::jsonb,
  target_per_day int not null default 1,
  archived boolean not null default false
);
create index if not exists habits_user_idx on public.habits(user_id);
create index if not exists habits_updated_idx on public.habits(user_id, updated_at);

-- ─── 表 14:habit_logs ─────────────────────────────────────────────
create table if not exists public.habit_logs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  habit_id uuid not null,
  date text not null,
  count int not null default 1,
  note text not null default ''
);
create index if not exists habit_logs_user_date_idx on public.habit_logs(user_id, date);
create index if not exists habit_logs_habit_date_idx on public.habit_logs(habit_id, date);
create index if not exists habit_logs_updated_idx on public.habit_logs(user_id, updated_at);

-- ─── 表 15:settings ───────────────────────────────────────────────
create table if not exists public.settings (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  device_id text not null,
  schema_version int not null default 1,
  key text not null,
  value jsonb,
  unique (user_id, key)
);
create index if not exists settings_updated_idx on public.settings(user_id, updated_at);

-- ============================================================================
-- Row Level Security:每张表只允许"我看自己的、改自己的"
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'accounts','categories','finance_transactions','budgets','tags',
    'calendar_events','focus_sessions','journals','recipes','recipe_items',
    'shopping_items','pantry_items','habits','habit_logs','settings'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    -- 4 条策略:select / insert / update / delete,统一以 user_id = auth.uid() 为锚
    execute format($f$
      create policy "%1$s_select_own" on public.%1$I
        for select using (user_id = auth.uid())
    $f$, t);

    execute format($f$
      create policy "%1$s_insert_own" on public.%1$I
        for insert with check (user_id = auth.uid())
    $f$, t);

    execute format($f$
      create policy "%1$s_update_own" on public.%1$I
        for update using (user_id = auth.uid())
        with check (user_id = auth.uid())
    $f$, t);

    execute format($f$
      create policy "%1$s_delete_own" on public.%1$I
        for delete using (user_id = auth.uid())
    $f$, t);

    -- updated_at 触发器
    execute format('drop trigger if exists %1$s_set_updated on public.%1$I', t);
    execute format($f$
      create trigger %1$s_set_updated
      before update on public.%1$I
      for each row execute function bn_set_updated_at()
    $f$, t);
  end loop;
end $$;

-- ============================================================================
-- Realtime publication —— Phase 3 自动同步必需
-- 让 Supabase Realtime 监听这 15 张表的 INSERT/UPDATE
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'accounts','categories','finance_transactions','budgets','tags',
    'calendar_events','focus_sessions','journals','recipes','recipe_items',
    'shopping_items','pantry_items','habits','habit_logs','settings'
  ];
begin
  -- 确保 publication 存在(Supabase 默认有 supabase_realtime)
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if not found then
    create publication supabase_realtime;
  end if;

  foreach t in array tables loop
    -- 添加表到 publication(已存在则忽略)
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null;  -- 已经在 publication 里,跳过
    end;
  end loop;
end $$;

-- ============================================================================
-- 自检查询:登录后跑下面这条,应该返回 0 行(没数据是对的)
--   select 'finance_transactions' as t, count(*) from public.finance_transactions
--   union all select 'journals', count(*) from public.journals;
-- 用别人账号查询应该返回 RLS 拒绝错误。
-- ============================================================================
