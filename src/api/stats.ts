import { request } from '../lib/http'
import type { TransactionType } from './categories'

export type MonthlySummary = { ledgerId: string, month: string, income: string, expense: string, balance: string }

export function getMonthlySummary(ledgerId: string, month: string, signal?: AbortSignal) {
  return request<MonthlySummary>('/stats/summary', { query: { ledgerId, month }, signal })
}

export type CategoryRatio = {
  ledgerId: string, month: string, type: TransactionType, total: string,
  list: { categoryId: string, category: { id: string, name: string, icon: string | null, type: TransactionType } | null, amount: string, ratio: number }[],
}
export type Trend = { ledgerId: string, months: number, list: { month: string, income: string, expense: string }[] }
export type CalendarStats = { ledgerId: string, month: string, list: { date: string, income: string, expense: string }[] }
export type RangeSummary = { ledgerId: string, startDate: string, endDate: string, income: string, expense: string, balance: string }

export function getCategoryRatio(ledgerId: string, month: string, type: TransactionType, signal?: AbortSignal) {
  return request<CategoryRatio>('/stats/category', { query: { ledgerId, month, type }, signal })
}

export function getTrend(ledgerId: string, signal?: AbortSignal) {
  return request<Trend>('/stats/trend', { query: { ledgerId }, signal })
}

export function getCalendar(ledgerId: string, month: string, signal?: AbortSignal) {
  return request<CalendarStats>('/stats/calendar', { query: { ledgerId, month }, signal })
}

export function getRangeSummary(ledgerId: string, startDate: string, endDate: string, signal?: AbortSignal) {
  return request<RangeSummary>('/stats/custom', { query: { ledgerId, startDate, endDate }, signal })
}
