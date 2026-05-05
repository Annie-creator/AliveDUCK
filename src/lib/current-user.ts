/**
 * 模块级"当前用户 id"holder。
 *
 * 为什么不直接在 BaseRepository 里 useAuth?
 * 因为 Repository 是普通 class 不是 React hook,
 * 跨 React 边界传递 user_id 最简单的桥梁就是这个模块全局变量。
 *
 * 写入:仅由 AuthProvider 在 session 变化时调用 setCurrentUserId()。
 * 读取:Repository.getUserId() 调用 getCurrentUserId()。
 *
 * 默认 'guest_local' 是给"未登录的本地用户"一个稳定身份,
 * 这样即便没有云端,本地查询照常按 user_id 索引筛选。
 */

export const GUEST_USER_ID = 'guest_local'

let currentUserId: string = GUEST_USER_ID

export function getCurrentUserId(): string {
  return currentUserId
}

export function setCurrentUserId(id: string | null): void {
  currentUserId = id ?? GUEST_USER_ID
}
