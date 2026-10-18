import { createContext, useContext, useEffect, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { request } from '../lib/http'
import { queryClient } from '../lib/query-client'
import { clearSession, getSessionGeneration, getTokens, restoreTokens, subscribeSession } from '../lib/token-storage'

type Session = { ready: boolean, signedIn: boolean, error: string | null, retry: () => Promise<void>, signOut: () => Promise<void> }
const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function restore() {
    setError(null)
    try {
      await restoreTokens()
      setSignedIn(Boolean(getTokens()))
      setReady(true)
    } catch { setError('无法读取登录状态，请重试') }
  }
  useEffect(() => {
    let generation = getSessionGeneration()
    const unsubscribe = subscribeSession(() => {
      if (generation !== getSessionGeneration()) {
        queryClient.clear()
        generation = getSessionGeneration()
      }
      setSignedIn(Boolean(getTokens()))
    })
    void restore()
    return unsubscribe
  }, [])
  async function signOut() {
    const generation = getSessionGeneration()
    if (getTokens()) await request('/auth/logout', { method: 'POST' })
    const token = getTokens()?.token
    if (token && generation === getSessionGeneration()) await clearSession(token)
  }
  return <SessionContext.Provider value={{ ready, signedIn, error, retry: restore, signOut }}>{children}</SessionContext.Provider>
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('SessionProvider is missing')
  return session
}
