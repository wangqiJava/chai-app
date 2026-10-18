import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { useNavigation } from 'expo-router'
import { usePreventRemove } from 'expo-router/react-navigation'
import type { NavigationAction } from 'expo-router/react-navigation'

export function useUnsavedChanges(dirty: boolean, busy = false) {
  const navigation = useNavigation()
  const pending = useRef<NavigationAction | null>(null)
  const completed = useRef(false)
  const [confirming, setConfirming] = useState(false)
  usePreventRemove(dirty || busy, ({ data }) => {
    if (completed.current) { navigation.dispatch(data.action); return }
    if (busy || pending.current) return
    pending.current = data.action
    setConfirming(true)
  })
  useEffect(() => {
    if (Platform.OS !== 'web' || (!dirty && !busy)) return
    const prevent = (event: BeforeUnloadEvent) => {
      if (completed.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty, busy])
  function keepEditing() { pending.current = null; setConfirming(false) }
  function discard() {
    if (busy) return
    const action = pending.current
    pending.current = null
    setConfirming(false)
    if (action) navigation.dispatch(action)
  }
  function complete(leave: () => void) {
    completed.current = true
    pending.current = null
    setConfirming(false)
    leave()
  }
  return { confirming, keepEditing, discard, complete }
}
