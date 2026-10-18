import { createContext, useContext, useState, useSyncExternalStore } from 'react'
import type { PropsWithChildren } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getLedgers } from '../api/ledgers'
import { resolveLedger } from '../lib/bookkeeping'
import { getSessionGeneration, subscribeSession } from '../lib/token-storage'
import { useSession } from './SessionProvider'

function useLedgerState() {
  const { ready, signedIn } = useSession()
  const generation = useSyncExternalStore(subscribeSession, getSessionGeneration, getSessionGeneration)
  const [selection, setSelection] = useState<{ generation: number, id: string } | null>(null)
  const query = useQuery({ queryKey: ['ledgers', generation], queryFn: ({ signal }) => getLedgers(signal), enabled: ready && signedIn })
  const ledgers = signedIn ? query.data || [] : []
  const current = resolveLedger(ledgers, selection?.generation === generation ? selection.id : null)
  return {
    signedIn, generation, ledgers, current,
    loading: signedIn && query.isPending, refreshing: query.isFetching,
    error: signedIn && query.isError ? query.error : null,
    refresh: query.refetch,
    select: (id: string) => setSelection({ generation, id }),
  }
}

const LedgerContext = createContext<ReturnType<typeof useLedgerState> | null>(null)

export function LedgerProvider({ children }: PropsWithChildren) {
  const value = useLedgerState()
  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger() {
  const value = useContext(LedgerContext)
  if (!value) throw new Error('LedgerProvider is missing')
  return value
}
