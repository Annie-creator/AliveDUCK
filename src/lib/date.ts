/** 当前 ISO8601 时间戳,精确到毫秒 */
export function nowIso(): string {
  return new Date().toISOString()
}

/** 任意可解析为 Date 的输入归一化为 ISO8601 */
export function toIso(input: string | number | Date): string {
  return new Date(input).toISOString()
}
