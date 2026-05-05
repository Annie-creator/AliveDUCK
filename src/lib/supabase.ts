import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Supabase 客户端单例。
 *
 * 设计:配置缺失时返回 null(不抛错),让 app 仍能纯本地运行。
 * 这样:
 * - 没填 .env 的用户:游客模式可用,云端按钮显示"未配置"
 * - 填了的用户:全功能解锁
 *
 * anon key 是公开的,可以放前端;真正的隔离靠 RLS。
 */
export const supabase: SupabaseClient | null =
  URL && ANON_KEY
    ? createClient(URL, ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true, // 处理 OAuth 回调
        },
      })
    : null

export const isSupabaseConfigured = supabase !== null
