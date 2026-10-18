import { monthKey, validDate } from './bookkeeping'

// Money stays in integer cents for derived labels; floating point is only used for drawing.
export function cents(value: string): bigint {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) throw new Error('Invalid money')
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  return negative ? -result : result
}

export function moneyFromCents(value: bigint) {
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}

export function averageMoney(value: string, days: number) {
  if (!Number.isInteger(days) || days < 1) return '0.00'
  const amount = cents(value)
  const divisor = BigInt(days)
  const absolute = amount < 0n ? -amount : amount
  const rounded = (absolute + divisor / 2n) / divisor
  return moneyFromCents(amount < 0n ? -rounded : rounded)
}

export function monthDays(month: string) {
  const [year, number] = month.split('-').map(Number)
  return new Date(year, number, 0).getDate()
}

export function averageDays(month: string, now = new Date()) {
  return month === monthKey(now) ? now.getDate() : monthDays(month)
}

export function remainingDays(month: string, now = new Date()) {
  const current = monthKey(now)
  if (month < current) return 0
  return month === current ? monthDays(month) - now.getDate() + 1 : monthDays(month)
}

export function previousMonth(month: string) {
  const [year, number] = month.split('-').map(Number)
  return monthKey(new Date(year, number - 2, 1))
}

export function validRange(start: string, end: string) {
  return validDate(start) && validDate(end) && start <= end
}

export function changePercent(current: string, previous: string) {
  const base = cents(previous)
  if (base <= 0n) return null
  const difference = cents(current) - base
  const absolute = difference < 0n ? -difference : difference
  const tenths = (absolute * 1000n + base / 2n) / base
  return `${difference < 0n ? '-' : difference > 0n ? '+' : ''}${tenths / 10n}.${tenths % 10n}%`
}

export function budgetProgress(amount: string, spent: string) {
  const total = cents(amount)
  const used = cents(spent)
  if (total <= 0n) return { percent: 0, label: '0.0%', over: used > 0n, warning: used > 0n }
  const tenths = (used * 1000n + total / 2n) / total
  return {
    percent: Math.max(0, Math.min(100, Number(used) / Number(total) * 100)),
    label: `${tenths / 10n}.${tenths % 10n}%`,
    over: used > total,
    warning: used * 100n >= total * 90n,
  }
}

export function chartParts(values: string[]) {
  const amounts = values.map(value => Math.max(0, Number(cents(value))))
  const total = amounts.reduce((sum, value) => sum + value, 0)
  let start = 0
  return amounts.map(value => {
    const fraction = total > 0 ? value / total : 0
    const part = { start, fraction }
    start += fraction
    return part
  })
}
