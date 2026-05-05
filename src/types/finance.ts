import type { SyncableEntity } from './sync'

/** 资金账户:现金、银行卡、支付宝、Bizum、PayPal... */
export interface Account extends SyncableEntity {
  name: string
  type: 'cash' | 'debit_card' | 'credit_card' | 'alipay' | 'wechat' | 'bizum' | 'paypal' | 'other'
  /** ISO 4217 货币代码,例如 'EUR' / 'CNY' / 'USD' */
  currency: string
  /** 账户初始余额(以该账户币种计) */
  initial_balance: number
  icon: string
  color: string
  /** 排序权重,数值越小越靠前 */
  sort_order: number
  archived: boolean
}

/** 收支分类(餐饮 / 交通 / 房租 / 学习 / ...)*/
export interface Category extends SyncableEntity {
  name: string
  /** 收入类还是支出类,转账不归类 */
  kind: 'income' | 'expense'
  icon: string
  color: string
  sort_order: number
  /** 父分类 id,支持二级分类(初版可全留 null)*/
  parent_id: string | null
  archived: boolean
}

/**
 * 记账主表 —— Project Aim D/E 章节的核心。
 * 收入、支出、转账三种类型;转账时 from_account_id + to_account_id 都填。
 */
export interface FinanceTransaction extends SyncableEntity {
  type: 'income' | 'expense' | 'transfer'

  /** 发生时间(ISO8601),与 created_at 区分:created_at 是录入时间 */
  occurred_at: string

  /** 金额(永远为正数,正负由 type 决定)*/
  amount: number

  /** 这笔账本身的币种,例如在西班牙刷卡 = 'EUR' */
  currency: string

  /**
   * 当时的汇率快照(相对本位币 base_currency,见 settings)。
   * 锁定历史汇率非常关键 —— 否则月度汇总会被实时汇率污染。
   */
  exchange_rate: number

  /** 分类 id。转账可为 null */
  category_id: string | null

  /** 支出账户(expense 必填,transfer 是出账)*/
  from_account_id: string | null

  /** 收入/转入账户(income 必填,transfer 是入账)*/
  to_account_id: string | null

  /** 交易对象/商家/人(自由文本,后期可演进为关联表) */
  participant: string

  /** 备注/描述 */
  note: string

  /** 标签 id 数组,关联 tags 表 */
  tag_ids: string[]
}

/** 月度/分类预算 */
export interface Budget extends SyncableEntity {
  /** YYYY-MM 格式,例如 '2026-05' */
  month: string
  /** null 表示总预算;否则按分类预算 */
  category_id: string | null
  /** 预算金额(本位币计) */
  amount: number
  /** 币种 —— 通常等于 settings.base_currency */
  currency: string
}
