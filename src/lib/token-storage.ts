import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

export type TokenPair = { token: string, refreshToken: string, expiresIn: number }
const key = 'chai.session.v1'
let tokens: TokenPair | null = null
let generation = 0
let restored = false
let pending: Promise<unknown> = Promise.resolve()
const listeners = new Set<() => void>()

export function isTokenPair(value: unknown): value is TokenPair {
  if (!value || typeof value !== 'object') return false
  const pair = value as TokenPair
  return typeof pair.token === 'string' && pair.token.length > 0
    && typeof pair.refreshToken === 'string' && pair.refreshToken.length > 0
    && typeof pair.expiresIn === 'number' && Number.isFinite(pair.expiresIn) && pair.expiresIn > 0
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation, operation)
  pending = result.catch(() => undefined)
  return result
}

function notify() { listeners.forEach(listener => listener()) }
export function getTokens() { return tokens }
export function getSessionGeneration() { return generation }
export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function restoreTokens() {
  return serialize(async () => {
    if (restored) return
    if (Platform.OS !== 'web') {
      const saved = await SecureStore.getItemAsync(key)
      if (saved) {
        let parsed: unknown
        try { parsed = JSON.parse(saved) } catch { parsed = null }
        if (isTokenPair(parsed)) tokens = parsed
        else await SecureStore.deleteItemAsync(key)
      }
    }
    restored = true
    notify()
  })
}

// Serialize persistence so an older refresh cannot overwrite a later logout.
export function setSessionTokens(pair: TokenPair, expectedRefreshToken?: string, login?: { expectedGeneration: number, signal?: AbortSignal }) {
  return serialize(async () => {
    if (!isTokenPair(pair)) throw new Error('登录凭证无效')
    if (login && (login.expectedGeneration !== generation || login.signal?.aborted)) {
      throw new Error('登录状态已变更，请重试')
    }
    if (expectedRefreshToken !== undefined && tokens?.refreshToken !== expectedRefreshToken) {
      throw new Error('登录状态已变更，请重试')
    }
    const next = { token: pair.token, refreshToken: pair.refreshToken, expiresIn: pair.expiresIn }
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(key, JSON.stringify(next))
      // Cancellation can arrive during native persistence; restore the previous session before releasing the queue.
      if (login?.signal?.aborted) {
        if (tokens) await SecureStore.setItemAsync(key, JSON.stringify(tokens))
        else await SecureStore.deleteItemAsync(key)
        throw new Error('登录状态已变更，请重试')
      }
    }
    if (expectedRefreshToken === undefined) generation++
    tokens = next
    restored = true
    notify()
  })
}

export function clearSession(expectedToken?: string) {
  return serialize(async () => {
    if (expectedToken !== undefined && tokens?.token !== expectedToken) return
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(key)
    tokens = null
    generation++
    restored = true
    notify()
  })
}
