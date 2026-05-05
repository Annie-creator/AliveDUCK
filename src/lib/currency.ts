/**
 * 多币种工具。
 *
 * 设计:
 * - 设置一个 base_currency(默认 EUR),全站统计折算到这个币种
 * - exchange_rates 设置存"相对 base 的倍数"
 *   例:base=EUR, rates={ CNY: 7.8, USD: 0.92 }
 *       表示 1 EUR = 7.8 CNY, 1 EUR = 0.92 USD
 * - 记账时:transaction.amount(原币) × exchange_rate = 折算到 base 的金额
 *   exchange_rate = 1 / rates[transaction.currency](因为 rates 表达的是 base→其他)
 *   …这样设计后,支出 €10 in EUR(base)的 exchange_rate 就是 1
 *   支出 ¥78 in CNY 的 exchange_rate = 1/7.8 ≈ 0.128(78 × 0.128 = 10 EUR)
 * - 历史汇率快照:记账时把当时 exchange_rate 写入 transaction.exchange_rate,
 *   后续 rates 改了不影响历史统计 —— 这是 Project Aim 钉死的口径
 */

import { settingsRepo } from '@/repositories'

export const BASE_CURRENCY_KEY = 'base_currency'
export const EXCHANGE_RATES_KEY = 'exchange_rates'

export type CurrencyCode = 'EUR' | 'USD' | 'DKK' | 'CHF' | 'GBP' | 'CNY' | string

/** 用户实际会用到的 6 种货币(欧元 / 美元 / 丹麦克朗 / 瑞士法郎 / 英镑 / 人民币)*/
export const SUPPORTED_CURRENCIES: string[] = ['EUR', 'USD', 'DKK', 'CHF', 'GBP', 'CNY']

/** 默认设置(一开始没人设过 settings 时用) */
export const DEFAULT_BASE = 'EUR'
/** 单位换算口径:1 EUR = X 该币种(参考 2025 年中近似值,用户可在设置里修改) */
export const DEFAULT_RATES: Record<string, number> = {
  EUR: 1,
  USD: 1.08,
  DKK: 7.46,
  CHF: 0.96,
  GBP: 0.85,
  CNY: 7.80,
}

export async function getBaseCurrency(): Promise<string> {
  return (await settingsRepo.getValue<string>(BASE_CURRENCY_KEY)) ?? DEFAULT_BASE
}

export async function setBaseCurrency(code: string): Promise<void> {
  await settingsRepo.setValue(BASE_CURRENCY_KEY, code)
}

export async function getRates(): Promise<Record<string, number>> {
  const stored = await settingsRepo.getValue<Record<string, number>>(EXCHANGE_RATES_KEY)
  return { ...DEFAULT_RATES, ...stored }
}

export async function setRates(rates: Record<string, number>): Promise<void> {
  await settingsRepo.setValue(EXCHANGE_RATES_KEY, rates)
}

/**
 * 记账时:根据 transaction.currency 算出当前 exchange_rate 快照。
 * 返回:把 transaction.amount × 这个值,得到 base 货币金额。
 *
 * 例:base=EUR, rates={CNY:7.8}, transaction in CNY ¥78
 *   exchange_rate = 1/7.8 ≈ 0.128
 *   后续 sum(amount × exchange_rate) = 78 × 0.128 = 10 EUR ✓
 */
export function rateToBase(
  txCurrency: string,
  baseCurrency: string,
  rates: Record<string, number>,
): number {
  if (txCurrency === baseCurrency) return 1
  const r = rates[txCurrency]
  if (!r || r === 0) return 1 // 找不到汇率退回 1:1,避免乘 0
  return 1 / r
}

/** 折算到 base 货币的金额 */
export function toBaseAmount(
  amount: number,
  exchangeRate: number,
): number {
  return amount * exchangeRate
}

/** UI 显示用:格式化货币金额 */
export function formatMoney(amount: number, currency: string): string {
  const symbol =
    currency === 'EUR' ? '€'
      : currency === 'CNY' ? '¥'
      : currency === 'USD' ? '$'
      : currency === 'GBP' ? '£'
      : currency === 'JPY' ? '¥'
      : currency + ' '
  return `${symbol}${amount.toFixed(2)}`
}
