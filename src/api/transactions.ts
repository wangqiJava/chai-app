import { request } from '../lib/http'
import type { Category, TransactionType } from './categories'

export type Transaction = {
  id: string, ledgerId: string, categoryId: string, type: TransactionType, amount: string,
  date: string, remark: string | null, category?: Category | null,
}
export type TransactionGroup = { date: string, items: Transaction[] }
export type TransactionList = {
  list: TransactionGroup[], pagination: { page: number, pageSize: number, total: number, totalPages: number },
}
export type TransactionInput = {
  ledgerId: string, categoryId: string, type: TransactionType, amount: string, date: string, remark: string,
}

export function getTransactions(params: { ledgerId: string, month: string, categoryId?: string, page: number }, signal?: AbortSignal) {
  return request<TransactionList>('/transactions', { query: { ...params, pageSize: 20 }, signal })
}

export function getTransaction(id: string, signal?: AbortSignal) {
  return request<Transaction>(`/transactions/${encodeURIComponent(id)}`, { signal })
}

export function createTransaction(data: TransactionInput, signal?: AbortSignal) {
  return request<Transaction>('/transactions', { method: 'POST', body: data, signal })
}

export function updateTransaction(id: string, data: TransactionInput, signal?: AbortSignal) {
  return request<Transaction>(`/transactions/${encodeURIComponent(id)}`, { method: 'PUT', body: data, signal })
}

export function deleteTransaction(id: string, signal?: AbortSignal) {
  return request<{ id: string }>(`/transactions/${encodeURIComponent(id)}`, { method: 'DELETE', signal })
}
