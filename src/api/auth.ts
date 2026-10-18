import { request } from '../lib/http'
import { getSessionGeneration, isTokenPair, setSessionTokens } from '../lib/token-storage'
import type { TokenPair } from '../lib/token-storage'

export type UserProfile = { id: string, nickname: string | null, avatarUrl: string | null, createdAt: string }
type LoginResult = TokenPair & { isNewUser: boolean, user: UserProfile }

export async function passwordLogin(username: string, password: string, signal?: AbortSignal) {
  const generation = getSessionGeneration()
  const result = await request<LoginResult>('/auth/password-login', {
    method: 'POST', auth: false, body: { username: username.trim().toLowerCase(), password }, signal,
  })
  if (!isTokenPair(result) || !result.user || typeof result.user.id !== 'string' || !result.user.id) {
    throw new Error('登录结果异常，请重试')
  }
  if (signal?.aborted || getSessionGeneration() !== generation) throw new Error('登录状态已变更，请重试')
  await setSessionTokens(result, undefined, { expectedGeneration: generation, signal })
  return result.user
}

export function getProfile(signal?: AbortSignal) {
  return request<UserProfile>('/user/profile', { signal })
}

export function updateProfile(nickname: string, signal?: AbortSignal) {
  return request<UserProfile>('/user/profile', { method: 'PUT', body: { nickname }, signal })
}

export function uploadAvatar(file: FormData, signal?: AbortSignal) {
  return request<UserProfile>('/user/avatar', { method: 'POST', body: file, signal })
}
