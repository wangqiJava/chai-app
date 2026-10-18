import { Image, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { MessageSquare } from 'lucide-react-native'
import { ActionButton, Screen } from '../src/components/Screen'
import { LEGAL_NOTICE, LEGAL_VERSION, privacy, terms } from '../src/lib/legal'
import { useTheme } from '../src/theme'

export default function AboutPage() {
  const { colors, ui } = useTheme()
  const { document } = useLocalSearchParams<{ document?: string }>()
  if (document === 'app') return <Screen title="关于柴记账" back><View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}><Image source={require('../assets/icon.png')} accessibilityLabel="柴记账" style={{ width: 80, height: 80, borderRadius: 20 }} /><Text style={[ui.title, { color: colors.brand, fontSize: 24 }]}>柴记账</Text><Text style={ui.body}>记一笔，轻松掌握每月收支</Text><Text style={ui.muted}>版本 0.1.0</Text></View><View style={{ gap: 12 }}><ActionButton label="用户协议" secondary onPress={() => router.push({ pathname: '/about', params: { document: 'terms' } })} /><ActionButton label="隐私说明" secondary onPress={() => router.push({ pathname: '/about', params: { document: 'privacy' } })} /><ActionButton label="反馈与帮助" icon={MessageSquare} secondary onPress={() => router.push('/support')} /></View></Screen>
  const isPrivacy = document === 'privacy'
  return <Screen title={isPrivacy ? '隐私说明' : '用户协议'} subtitle="柴记账 App" back>
    <View style={ui.section}><Text style={ui.muted}>文案版本：{LEGAL_VERSION}</Text><Text style={ui.body}>{LEGAL_NOTICE}</Text></View>
    {(isPrivacy ? privacy : terms).map((section, index) => <View key={section.title} style={ui.section}><Text accessibilityRole="header" style={ui.sectionTitle}>{index + 1}. {section.title}</Text><Text selectable style={ui.body}>{section.text}</Text></View>)}
    <View style={ui.section}><ActionButton label="反馈与个人信息请求" icon={MessageSquare} secondary onPress={() => router.push('/support')} /></View>
  </Screen>
}
