import { useCallback, useEffect, useRef } from 'react'
import { ActivityIndicator, AppState, Platform, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import * as SystemUI from 'expo-system-ui'
import { QueryClientProvider, focusManager } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { queryClient } from '../src/lib/query-client'
import { SessionProvider, useSession } from '../src/providers/SessionProvider'
import { ActionButton } from '../src/components/Screen'
import { useTheme } from '../src/theme'
import { LedgerProvider } from '../src/providers/LedgerProvider'
import { ThemeProvider } from '../src/providers/ThemeProvider'

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync().catch(() => {})
  if (Platform.OS === 'android') {
    SplashScreen.setOptions({ duration: 0, fade: false })
  }
}

function Navigation() {
  const { colors, ui, dark, ready: themeReady } = useTheme()
  const { ready, error, retry } = useSession()
  const splashHidden = useRef(false)
  const hideFrame = useRef<number | null>(null)
  const onContentLayout = useCallback(() => {
    if (Platform.OS === 'web' || splashHidden.current || hideFrame.current !== null) return
    // Keep the native splash until the destination has a layout, not just a restored session.
    hideFrame.current = requestAnimationFrame(() => {
      hideFrame.current = null
      splashHidden.current = true
      SplashScreen.hide()
    })
  }, [])
  useEffect(() => () => {
    if (hideFrame.current !== null) cancelAnimationFrame(hideFrame.current)
  }, [])
  useEffect(() => {
    if (Platform.OS === 'web') return
    const subscription = AppState.addEventListener('change', state => focusManager.setFocused(state === 'active'))
    return () => subscription.remove()
  }, [])
  useEffect(() => {
    if (themeReady && Platform.OS !== 'web') void SystemUI.setBackgroundColorAsync(colors.canvas).catch(() => {})
  }, [themeReady, colors.canvas])
  if (!ready || !themeReady) return <View key={error ? 'error' : 'loading'} onLayout={error && themeReady ? onContentLayout : undefined} style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20, padding: 24, backgroundColor: colors.canvas }}>{error ? <><Text style={ui.body}>{error}</Text><ActionButton label="重试" onPress={() => void retry()} /></> : <ActivityIndicator size="large" color={colors.brand} />}</View>
  return <><StatusBar style={dark ? 'light' : 'dark'} /><Stack screenLayout={({ children }) => <View onLayout={onContentLayout} style={{ flex: 1 }}>{children}</View>} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}><Stack.Screen name="(tabs)" /><Stack.Screen name="login" /><Stack.Screen name="record" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} /><Stack.Screen name="profile" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} /></Stack></>
}

function ThemedRoot() {
  const { colors } = useTheme()
  return <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.canvas }}><QueryClientProvider client={queryClient}><SessionProvider><LedgerProvider><Navigation /></LedgerProvider></SessionProvider></QueryClientProvider></SafeAreaProvider>
}

export default function RootLayout() {
  return <ThemeProvider><ThemedRoot /></ThemeProvider>
}
