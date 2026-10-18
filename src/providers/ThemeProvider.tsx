import { useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { NativeModules, Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { colors, createUI, darkColors, ThemeContext } from '../theme'

const key = 'chai-appearance-dark'
let writes = Promise.resolve()
const nativeAppearance = Platform.OS === 'android' ? NativeModules.ChaiAppearance : undefined

async function syncNativeTheme(dark: boolean) {
  if (nativeAppearance) await nativeAppearance.setDark(dark)
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [dark, updateDark] = useState(nativeAppearance?.initialDark === true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    async function restore() {
      try {
        const value = Platform.OS === 'web' ? localStorage.getItem(key) : await SecureStore.getItemAsync(key)
        if (!active) return
        const next = value === null ? nativeAppearance?.initialDark === true : value === 'true'
        updateDark(next)
        await syncNativeTheme(next)
      } catch { if (active) setError('外观偏好未能完整恢复，请重新切换外观设置') }
      finally { if (active) setReady(true) }
    }
    void restore()
    return () => { active = false }
  }, [])
  const value = useMemo(() => {
    const palette = dark ? darkColors : colors
    return { colors: palette, ui: createUI(palette), dark, ready, error, setDark(next: boolean) {
      updateDark(next)
      setError('')
      // Serialize persistence so rapid toggles cannot restore an older preference.
      writes = writes.then(async () => {
        if (Platform.OS === 'web') localStorage.setItem(key, String(next))
        else {
          await SecureStore.setItemAsync(key, String(next))
          await syncNativeTheme(next)
        }
      }).catch(() => setError('外观已切换，但未能保存；下次启动可能恢复原设置'))
    } }
  }, [dark, ready, error])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
