import { useEffect, useState } from 'react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  DEFAULT_BASE,
  DEFAULT_RATES,
  SUPPORTED_CURRENCIES,
  getBaseCurrency,
  getRates,
  setBaseCurrency,
  setRates,
} from '@/lib/currency'

const SUPPORTED = SUPPORTED_CURRENCIES

export function CurrencySettings() {
  const [base, setBase] = useState(DEFAULT_BASE)
  const [rates, setRatesState] = useState<Record<string, number>>(DEFAULT_RATES)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void Promise.all([getBaseCurrency(), getRates()]).then(([b, r]) => {
      setBase(b)
      setRatesState(r)
    })
  }, [])

  function updateRate(code: string, val: string) {
    const n = Number(val)
    if (!Number.isFinite(n) || n <= 0) return
    setRatesState({ ...rates, [code]: n })
    setSaved(false)
  }

  async function save() {
    await setBaseCurrency(base)
    await setRates(rates)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <GlassPanel padding="lg" radius="lg">
      <h2 className="mb-1 text-base font-medium"
        style={{ color: 'var(--bn-text-primary)' }}>
        多币种与汇率
      </h2>
      <p className="mb-3 text-xs leading-relaxed"
        style={{ color: 'var(--bn-text-secondary)' }}>
        本位币用来全站统计折算。汇率写"1 本位币 = 多少其他币种"。
        每笔账记账时锁定汇率快照,后续改了不影响历史数据。
      </p>

      <div className="mb-3">
        <label className="mb-1 block text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          本位币
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SUPPORTED.map((c) => {
            const active = base === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => { setBase(c); setSaved(false) }}
                className="bn-mono rounded-full px-3 py-1 text-xs transition-all"
                style={{
                  background: active ? 'var(--bn-glass-strong)' : 'var(--bn-glass)',
                  color: active ? 'var(--bn-text-primary)' : 'var(--bn-text-tertiary)',
                  border: `0.5px solid ${active ? 'var(--bn-accent)' : 'var(--bn-glass-border)'}`,
                  fontWeight: active ? 500 : 400,
                  boxShadow: active ? 'inset 0 0 0 0.5px var(--bn-accent)' : 'none',
                }}
              >
                {c}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--bn-text-tertiary)' }}>
          汇率(1 {base} 等于…)
        </label>
        <div className="space-y-2">
          {SUPPORTED.filter((c) => c !== base).map((c) => (
            <div key={c} className="flex items-center gap-2">
              <span className="bn-mono w-12 text-sm"
                style={{ color: 'var(--bn-text-secondary)' }}>
                {c}
              </span>
              <Input
                type="number"
                step="0.0001"
                value={rates[c] ?? ''}
                onChange={(e) => updateRate(c, e.target.value)}
                className="flex-1"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={save}>保存</Button>
        {saved && <span className="text-xs" style={{ color: 'var(--bn-positive)' }}>✓ 已保存</span>}
      </div>
    </GlassPanel>
  )
}
