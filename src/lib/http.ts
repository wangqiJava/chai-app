import { clearSession, getSessionGeneration, getTokens, isTokenPair, restoreTokens, setSessionTokens } from './token-storage'
import type { TokenPair } from './token-storage'

type Envelope<T> = { code: number, msg?: string, data: T }
type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  signal?: AbortSignal
  auth?: boolean
}

export class ApiError extends Error {
  constructor(message: string, public status = 0, public code?: number) { super(message) }
}

export function getApiBaseUrl() {
  const value = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '')
  if (!value) throw new ApiError('尚未配置服务地址')
  let url: URL
  try { url = new URL(value) } catch { throw new ApiError('服务地址无效') }
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) {
    throw new ApiError('服务地址无效')
  }
  if (!__DEV__ && url.protocol !== 'https:') throw new ApiError('正式版本需要 HTTPS 服务地址')
  return value
}

async function send<T>(path: string, options: Options, token?: string): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) throw new ApiError('接口路径无效')
  const url = new URL(`${getApiBaseUrl()}${path}`)
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value))
  })
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (options.signal?.aborted) abort()
  options.signal?.addEventListener('abort', abort)
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 15000)
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  try {
    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : isForm ? options.body as FormData : JSON.stringify(options.body),
      signal: controller.signal,
    })
    let envelope: Envelope<T> | undefined
    try { envelope = await response.json() } catch {}
    if (!response.ok) throw new ApiError(envelope?.msg || '请求失败，请稍后重试', response.status, envelope?.code)
    if (!envelope || typeof envelope.code !== 'number') throw new ApiError('服务返回的数据格式不正确', response.status)
    if (envelope.code !== 0) throw new ApiError(envelope.msg || '操作未完成', response.status, envelope.code)
    return envelope.data
  } catch (error) {
    if (timedOut) throw new ApiError('请求超时，请稍后重试')
    if (error instanceof ApiError || options.signal?.aborted) throw error
    throw new ApiError('网络连接失败，请稍后重试')
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}

let refreshJob: { token: string, promise: Promise<void> } | null = null

function refreshSession() {
  const current = getTokens()
  if (!current) return Promise.reject(new ApiError('请先登录', 401))
  if (refreshJob?.token === current.refreshToken) return refreshJob.promise
  const job = {
    token: current.refreshToken,
    promise: send<TokenPair>('/auth/refresh', { method: 'POST', auth: false, body: { refreshToken: current.refreshToken } })
      .then(async pair => {
        if (!isTokenPair(pair)) throw new ApiError('登录状态暂时无法验证，请稍后重试')
        await setSessionTokens(pair, current.refreshToken)
      })
      .catch(async error => {
        if (error instanceof ApiError && (error.status === 401 || error.code === 20001)) {
          await clearSession(current.token)
        }
        throw error
      })
      .finally(() => { if (refreshJob === job) refreshJob = null }),
  }
  refreshJob = job
  return job.promise
}

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  if (options.auth === false) return send<T>(path, options)
  await restoreTokens()
  const generation = getSessionGeneration()
  const initial = getTokens()
  if (!initial) throw new ApiError('请先登录', 401)
  const assertSession = () => {
    if (getSessionGeneration() !== generation) throw new ApiError('登录状态已变更，请重试')
  }
  try {
    const data = await send<T>(path, options, initial.token)
    assertSession()
    return data
  } catch (error) {
    assertSession()
    if (!(error instanceof ApiError) || error.status !== 401 || options.signal?.aborted) throw error
    if (getTokens()?.token === initial.token) await refreshSession()
    assertSession()
    const retryToken = getTokens()?.token
    if (!retryToken) throw new ApiError('请重新登录', 401)
    try {
      const data = await send<T>(path, options, retryToken)
      assertSession()
      return data
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401) await clearSession(retryToken)
      throw retryError
    }
  }
}

export function upload<T>(path: string, file: { uri: string, name: string, type: string }, signal?: AbortSignal) {
  const data = new FormData()
  data.append('file', file as unknown as Blob)
  return request<T>(path, { method: 'POST', body: data, signal })
}
