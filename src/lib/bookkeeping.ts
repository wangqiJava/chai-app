import type { Ledger } from '../api/ledgers'
import type { TransactionGroup, TransactionList } from '../api/transactions'

export function resolveLedger(ledgers: Ledger[], selectedId: string | null) {
  return ledgers.find(item => item.id === selectedId) || ledgers.find(item => item.isDefault) || ledgers[0] || null
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function todayKey(date = new Date()) {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1) return false
  return day <= new Date(year, month, 0).getDate()
}

export function normalizeAmount(value: string): string | null {
  if (!/^\d{0,14}(\.\d{0,2})?$/.test(value) || !/[1-9]/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  return `${(whole || '0').replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`
}

export function formatMoney(value?: string | null) {
  if (typeof value !== 'string' || !/^-?\d+(\.\d{1,2})?$/.test(value)) return '--'
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.')
  return `${negative ? '-' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`
}

// A day's rows may straddle pages; merge by date and deduplicate IDs across the whole result.
export function mergeTransactionPages(pages: TransactionList[]): TransactionGroup[] {
  const groups = new Map<string, TransactionGroup>()
  const seen = new Set<string>()
  for (const page of pages) {
    for (const group of page.list) {
      for (const item of group.items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        if (!groups.has(group.date)) groups.set(group.date, { date: group.date, items: [] })
        groups.get(group.date)!.items.push(item)
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export function nextTransactionPage(page: TransactionList) {
  return page.pagination.page < page.pagination.totalPages ? page.pagination.page + 1 : undefined
}
