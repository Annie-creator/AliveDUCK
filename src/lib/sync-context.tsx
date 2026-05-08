import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { syncEngine, type SyncEngineState } from '@/lib/sync-engine'
import { promoteGuestData } from '@/lib/sync'
import { markSyncReady, resetSyncReady } from '@/lib/seed-defaults'

interface SyncContextValue {
  state: SyncEngineState
  forceSyncNow: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

/**
 * 把 syncEngine 单例和 React 树连起来。
 * 必须嵌在 AuthProvider 里(因为要读 user)。
 *
 * **重复分类 bug 修复(2026-05)**:
 * ensureDefaults() 默认是阻塞的,等这里调 markSyncReady() 才放行。
 * - 游客(没登录):没有云端,立即放行。
 * - 登录:必须等 syncEngine.start() 跑完(首次 pull 完成),
 *   云端的 categories 已经装到本地,这时再 seed 才不会撞 UUID。
 * - 切账号:resetSyncReady() 让 seed 重新等待新一轮 pull。
 * - 即使 start() 抛错(网络断了)也得放行 —— offline-first,
 *   离线时也允许 seed 默认数据。
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [state, setState] = useState<SyncEngineState>(syncEngine.getState())

  // 订阅引擎状态
  useEffect(() => syncEngine.subscribe(setState), [])

  // 跟随登录态启停引擎
  useEffect(() => {
    if (!user) {
      void syncEngine.stop()
      // 游客模式:没有云端要等,seed 立即放行
      markSyncReady()
      return
    }

    // 切到登录态,先把 seed 闸门关上,等首次 pull 完成再开
    resetSyncReady()

    let cancelled = false
    void (async () => {
      try {
        // 登录后第一件事:把游客时代积累的本地数据"过户"给真账号
        // (sync_status 重置为 pending,start() 里会推到云)
        await promoteGuestData(user.id)
        if (cancelled) return
        // start() 内部会 await runPull() —— 完成后云端 categories 已落本地
        await syncEngine.start(user.id)
      } catch (e) {
        // 网络挂了 / 配置错了 都不能阻塞 seed —— 离线一样要能用
        // eslint-disable-next-line no-console
        console.warn('[sync] start failed, seeding anyway (offline-first):', e)
      } finally {
        if (!cancelled) markSyncReady()
      }
    })()

    return () => {
      cancelled = true
      void syncEngine.stop()
    }
  }, [user?.id])

  const forceSyncNow = useCallback(() => syncEngine.forceSyncNow(), [])

  return (
    <SyncContext.Provider value={{ state, forceSyncNow }}>{children}</SyncContext.Provider>
  )
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be inside <SyncProvider>')
  return ctx
}
