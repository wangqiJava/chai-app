import { useState } from 'react'
import { Linking, Text, View } from 'react-native'
import { ExternalLink } from 'lucide-react-native'
import { ErrorNotice } from '../src/components/Bookkeeping'
import { ActionButton, Screen } from '../src/components/Screen'
import { SUPPORT_URL } from '../src/lib/legal'
import { useTheme } from '../src/theme'

export default function SupportPage() {
  const { colors, ui } = useTheme()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function openContact() {
    if (busy) return
    setError(''); setBusy(true)
    try { await Linking.openURL(SUPPORT_URL) } catch { setError('无法打开浏览器，请在微信中搜索“柴记账”，进入「我的 → 意见反馈」。') } finally { setBusy(false) }
  }
  return <Screen title="反馈与帮助" back>
    <View style={ui.section}><Text accessibilityRole="header" style={ui.sectionTitle}>问题反馈</Text><Text style={ui.body}>请在微信中打开「柴记账」小程序，进入「我的 → 意见反馈」。这是当前的反馈渠道，并非实时客服。</Text><Text style={ui.body}>请描述发生问题的操作步骤、手机型号和系统版本。截图中请遮挡无关的账目、密码和个人信息。</Text></View>
    <View style={ui.section}><Text accessibilityRole="header" style={ui.sectionTitle}>账号与个人信息请求</Text><Text style={ui.body}>忘记 App 密码：在小程序「我的 → App 账号设置」中重置。</Text><Text style={ui.body}>查询、更正、注销账号或删除历史数据：通过小程序意见反馈说明请求类型与范围，等待身份核实后处理。不要提交密码或验证码。</Text><Text style={ui.body}>退出登录和卸载 App 不会删除云端数据。本页仅提供渠道说明，打开本页不会提交任何申请。</Text></View>
    <View style={ui.section}><ActionButton label={busy ? '正在打开' : '打开官网联系入口'} icon={ExternalLink} secondary disabled={busy} onPress={() => void openContact()} /><Text selectable style={ui.muted}>{SUPPORT_URL}</Text><ErrorNotice error={error} /></View>
  </Screen>
}
