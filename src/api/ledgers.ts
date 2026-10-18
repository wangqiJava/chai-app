import { request } from '../lib/http'

export type Ledger = {
  id: string, userId: string, name: string, icon: string | null, isDefault: boolean, sort: number,
  monthlySummary?: { income: string, expense: string },
}

export function getLedgers(signal?: AbortSignal) {
  return request<Ledger[]>('/ledgers', { signal })
}

export function createLedger(name: string, signal?: AbortSignal) {
  return request<Ledger>('/ledgers', { method: 'POST', body: { name }, signal })
}

export function updateLedger(id: string, name: string, signal?: AbortSignal) {
  return request<Ledger>(`/ledgers/${encodeURIComponent(id)}`, { method: 'PUT', body: { name }, signal })
}

export function deleteLedger(id: string, signal?: AbortSignal) {
  return request<{ id: string }>(`/ledgers/${encodeURIComponent(id)}`, { method: 'DELETE', signal })
}

export function setDefaultLedger(id: string, signal?: AbortSignal) {
  return request<Ledger>(`/ledgers/${encodeURIComponent(id)}/default`, { method: 'PATCH', signal })
}
