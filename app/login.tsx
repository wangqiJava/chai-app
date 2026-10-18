import { useEffect, useRef, useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native'
import { router, useNavigation } from 'expo-router'
import { Eye, EyeOff, LogIn, Square, SquareCheck } from 'lucide-react-native'
import { ActionButton, IconButton, Screen } from '../src/components/Screen'
import { useTheme } from '../src/theme'
import { passwordLogin } from '../src/api/auth'
import { useSession } from '../src/providers/SessionProvider'

export default function LoginPage() {
  const { colors, ui } = useTheme()
  const { signedIn } = useSession()
  const navigation = useNavigation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [help, setHelp] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const passwordInput = useRef<TextInput>(null)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    if (!signedIn) return
    navigation.reset({ index: 0, routes: [{ name: '(tabs)', params: { screen: 'mine' } }] })
  }, [signedIn, navigation])
  async function login() {
    if (pending.current || signedIn) return
    setError('')
    if (!accepted) { setError('请先阅读并同意用户协议与隐私说明'); return }
    if (!/^[a-z][a-z0-9._-]{2,31}$/.test(username.trim().toLowerCase())) {
      setError('请输入有效的登录名')
      return
    }
    if (password.length < 12 || password.length > 128 || !password.trim()) {
      setError('请输入 12-128 个字符的密码')
      return
    }
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    try {
      await passwordLogin(username, password, controller.signal)
      if (!controller.signal.aborted) setPassword('')
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '登录未完成，请重试')
    } finally {
      if (!controller.signal.aborted) setBusy(false)
      if (pending.current === controller) pending.current = null
    }
  }
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen title="登录" back>
      <View style={{ flex: 1, justifyContent: 'center', gap: 28, paddingVertical: 24, width: '100%', maxWidth: 440, alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: 12 }}><Image source={require('../assets/icon.png')} accessibilityLabel="柴记账" style={{ width: 96, height: 96 }} resizeMode="contain" /><Text style={[ui.title, { color: colors.brand, fontSize: 24 }]}>柴记账</Text><Text style={ui.muted}>记一笔，轻松掌握每月收支</Text></View>
        <View style={{ gap: 20 }}>
          <View style={{ gap: 8 }}><Text style={ui.body}>登录名</Text><TextInput accessibilityLabel="登录名" value={username} onChangeText={setUsername} style={ui.input} editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" maxLength={32} returnKeyType="next" onSubmitEditing={() => passwordInput.current?.focus()} placeholder="请输入登录名" placeholderTextColor={colors.muted} /></View>
          <View style={{ gap: 8 }}><Text style={ui.body}>密码</Text><View style={[ui.input, { paddingVertical: 0, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }]}><TextInput ref={passwordInput} accessibilityLabel="密码" value={password} onChangeText={setPassword} style={{ flex: 1, minWidth: 0, minHeight: 52, fontSize: 16, color: colors.ink, paddingVertical: 12 }} editable={!busy} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" maxLength={128} returnKeyType="go" onSubmitEditing={() => void login()} placeholder="请输入密码" placeholderTextColor={colors.muted} /><IconButton label={visible ? '隐藏密码' : '显示密码'} icon={visible ? EyeOff : Eye} disabled={busy} onPress={() => setVisible(value => !value)} /></View></View>
          {error ? <Text accessibilityRole="alert" style={{ color: colors.expense, fontSize: 14, lineHeight: 22 }}>{error}</Text> : null}
          <View style={{ gap: 4 }}>
            <Pressable accessibilityRole="checkbox" accessibilityLabel="同意用户协议与隐私说明" accessibilityState={{ checked: accepted, disabled: busy }} disabled={busy} onPress={() => setAccepted(value => !value)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }, pressed && ui.pressed]}>{accepted ? <SquareCheck size={24} color={colors.brand} /> : <Square size={24} color={colors.muted} />}<Text style={[ui.body, { flex: 1 }]}>我已阅读并同意用户协议与隐私说明</Text></Pressable>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{[{ label: '用户协议', document: 'terms' }, { label: '隐私说明', document: 'privacy' }].map(item => <Pressable key={item.document} accessibilityRole="button" accessibilityLabel={`阅读${item.label}`} disabled={busy} onPress={() => router.push({ pathname: '/about', params: { document: item.document } })} style={({ pressed }) => [{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 }, pressed && ui.pressed]}><Text style={{ color: colors.brand, fontSize: 15 }}>{item.label}</Text></Pressable>)}</View>
          </View>
          <ActionButton label={busy ? '正在登录' : '登录'} icon={LogIn} disabled={busy || signedIn} onPress={() => void login()} />
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: help }} onPress={() => setHelp(value => !value)} style={({ pressed }) => [{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }, pressed && ui.pressed]}><Text style={{ color: colors.brand, fontSize: 14 }}>设置账号 / 忘记密码</Text></Pressable>
          {help && <Text style={ui.body}>请在柴记账小程序的「我的 → App 账号设置」中设置登录名或重置密码。</Text>}
          <ActionButton label="继续浏览" secondary disabled={busy} onPress={() => router.replace('/')} />
        </View>
      </View>
    </Screen>
    </KeyboardAvoidingView>
  )
}
