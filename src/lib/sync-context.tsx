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

interface SyncContextValue {
  state: SyncEngineState
  forceSyncNow: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

/**
 * 把 syncEngine 单例和 React 树连起来。
 * 必须嵌在 AuthProvider 里(因为要读 user)。
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
      return
    }

    let cancelled = false
    void (async () => {
      // 登录后第一件事:把游客时代积累的本地数据"过户"给真账号
      // (sync_status 重置为 pending,start() 里会推到云)
      await promoteGuestData(user.id)
      if (cancelled) return
      await syncEngine.start(user.id)
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
