import { request } from '../lib/http'

export type Budget = {
  id: string, userId: string, ledgerId: string, month: string, categoryId: string | null,
  amount: string, spent: string, remaining: string,
  category?: { id: string, name: string, icon: string | null } | null,
}
export type BudgetInput = { ledgerId: string, month: string, amount: string, categoryId?: string }

export function getBudgets(ledgerId: string, month: string, signal?: AbortSignal) {
  return request<Budget[]>('/budgets', { query: { ledgerId, month }, signal })
}

export function createBudget(data: BudgetInput, signal?: AbortSignal) {
  return request<Budget>('/budgets', { method: 'POST', body: data, signal })
}

export function updateBudget(id: string, amount: string, signal?: AbortSignal) {
  return request<Budget>(`/budgets/${encodeURIComponent(id)}`, { method: 'PUT', body: { amount }, signal })
}

export function deleteBudget(id: string, signal?: AbortSignal) {
  return request<{ id: string }>(`/budgets/${encodeURIComponent(id)}`, { method: 'DELETE', signal })
}
