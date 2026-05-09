/**
 * 模块级"当前用户 id"holder。
 *
 * 为什么不直接在 BaseRepository 里 useAuth?
 * 因为 Repository 是普通 class 不是 React hook,
 * 跨 React 边界传递 user_id 最简单的桥梁就是这个模块全局变量。
 *
 * 写入:AuthProvider 在 session 变化时调用 setCurrentUserId()。
 * 读取:Repository.getUserId() 调用 getCurrentUserId()。
 *
 * 默认 'guest_local' 是给"未登录的本地用户"一个稳定身份。
 *
 * **2026-05 修复:每次开 App 都本地认知 ≠ 服务器认知**
 *
 * 场景:用户已登录,但 AuthProvider 用 `await supabase.auth.getSession()` 拿
 * uid,这是异步的,要等到 promise 解析才会 setCurrentUserId(realUid)。在这
 * 1~2 秒空窗里,任何调用 getCurrentUserId() 的代码看到的都是 guest_local。
 *
 * 而 Supabase JS 客户端默认把 session token 同步存在 localStorage 里
 * (key 形如 `sb-<projectRef>-auth-token`)。我们在模块加载时直接同步读这
 * 个 key,先把 currentUserId 设对。后面 AuthProvider 的异步 getSession 跑
 * 完会再 setCurrentUserId 一次,如果 token 还有效就保持不变;如果 token
 * 真的失效了,会被设回 guest_local —— 这点小代价换来 100% 命中的常见路径。
 */

export const GUEST_USER_ID = 'guest_local'

let currentUserId: string = GUEST_USER_ID

/**
 * 模块加载时同步抢跑:从 supabase 的 localStorage token 拿 uid。
 *
 * 不验证 token 的实际有效性(这是 supabase 客户端的事)。这里只在乎
 * "用户最近一次登录的 uid 是多少",有就先用着。即便 token 到期 supabase
 * 也会 refresh,uid 不变;真彻底登出会触发 onAuthStateChange,届时 setCurrentUserId(null)
 * 会把这里清回 guest。
 */
function eagerInitFromStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith('sb-') || !k.endsWith('-auth-token')) continue
      const raw = localStorage.getItem(k)
      if (!raw) continue
      const data = JSON.parse(raw) as {
        user?: { id?: unknown }
        currentSession?: { user?: { id?: unknown } }
      }
      const uid =
        (typeof data?.user?.id === 'string' && data.user.id) ||
        (typeof data?.currentSession?.user?.id === 'string' && data.currentSession.user.id) ||
        null
      if (uid) {
        currentUserId = uid
        return
      }
    }
  } catch {
    // 解析失败就放弃,等 AuthProvider 后面 setCurrentUserId
  }
}

eagerInitFromStorage()

export function getCurrentUserId(): string {
  return currentUserId
}

export function setCurrentUserId(id: string | null): void {
  currentUserId = id ?? GUEST_USER_ID
}
