import { request } from '../lib/http'

export type TransactionType = 'EXPENSE' | 'INCOME'
export type Category = {
  id: string, userId?: string | null, ledgerId?: string | null, name: string, icon: string | null,
  type: TransactionType, isActive?: boolean, deletedAt?: string | null,
}

export function getCategories(ledgerId?: string, signal?: AbortSignal) {
  return request<Category[]>('/categories', { query: { ledgerId }, signal })
}

export function createCategory(data: { name: string, type: TransactionType }, signal?: AbortSignal) {
  return request<Category>('/categories', { method: 'POST', body: data, signal })
}

export function updateCategory(id: string, name: string, signal?: AbortSignal) {
  return request<Category>(`/categories/${encodeURIComponent(id)}`, { method: 'PUT', body: { name }, signal })
}

export function deleteCategory(id: string, signal?: AbortSignal) {
  return request<{ id: string }>(`/categories/${encodeURIComponent(id)}`, { method: 'DELETE', signal })
}
