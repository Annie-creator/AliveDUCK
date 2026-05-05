import { v4 as uuid } from 'uuid'

const DEVICE_ID_KEY = 'banya_device_id'

/**
 * 当前设备的稳定标识符。
 * 存在 localStorage 里(IndexedDB 不适合用作"读取自身的 ID"的场景)。
 * 用户清缓存会重置 —— 这是合理的:那就是一台"新设备"。
 */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = uuid()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}
