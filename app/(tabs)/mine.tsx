import { useCallback, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { BookOpen, ChevronRight, Cloud, FileText, Info, LogOut, MessageSquare, Moon, Plus, Shield, SlidersHorizontal, Tags } from 'lucide-react-native'
import { ActionButton, Screen } from '../../src/components/Screen'
import { useSession } from '../../src/providers/SessionProvider'
import { useTheme, themedStyles } from '../../src/theme'
import { useQuery } from '@tanstack/react-query'
import { getProfile } from '../../src/api/auth'
import { useLedger } from '../../src/providers/LedgerProvider'
import { getCategories } from '../../src/api/categories'
import { createLedger } from '../../src/api/ledgers'
import { getMonthlySummary } from '../../src/api/stats'
import type { TransactionList } from '../../src/api/transactions'
import { ErrorNotice, LoadingState, Sheet, useBookkeepingAction } from '../../src/components/Bookkeeping'
import { formatMoney, monthKey } from '../../src/lib/bookkeeping'
import { request } from '../../src/lib/http'
import { queryClient } from '../../src/lib/query-client'

export default function MinePage() {
  const { generation } = useLedger()
  return <MineContent key={generation} generation={generation} />
}

function MineContent({ generation }: { generation: number }) {
  const { colors, ui, dark, setDark, error: themeError } = useTheme()
  const styles = useStyles()
  const { signedIn, signOut } = useSession()
  const ledger = useLedger()
  const { refresh } = ledger
  const defaultLedger = ledger.ledgers.find(item => item.isDefault) || ledger.ledgers[0]
  const ledgerId = defaultLedger?.id || ''
  const month = monthKey(new Date())
  const enabled = signedIn && !!ledgerId
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [ledgerWidth, setLedgerWidth] = useState(0)
  const action = useBookkeepingAction()
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null)
  const profile = useQuery({ queryKey: ['user-profile', generation], queryFn: ({ signal }) => getProfile(signal), enabled: signedIn, retry: false })
  const { refetch } = profile
  const categories = useQuery({ queryKey: ['categories', generation, ledgerId], queryFn: ({ signal }) => getCategories(ledgerId, signal), enabled })
  const summary = useQuery({ queryKey: ['summary', generation, ledgerId, month], queryFn: ({ signal }) => getMonthlySummary(ledgerId, month, signal), enabled })
  // Match the mini-program: all-time record count for the default ledger, not this month's count.
  const count = useQuery({ queryKey: ['transactions', generation, ledgerId, 'mine-total'], queryFn: ({ signal }) => request<TransactionList>('/transactions', { query: { ledgerId, page: 1, pageSize: 1 }, signal }), enabled })
  const reload = useCallback(() => {
    if (!signedIn) return
    void refetch()
    void refresh()
    void queryClient.invalidateQueries({ predicate: query => ['categories', 'transactions', 'summary'].includes(String(query.queryKey[0])) && query.queryKey[1] === generation })
  }, [signedIn, generation, refetch, refresh])
  useFocusEffect(reload)
  const avatar = profile.data?.avatarUrl
  const showAvatar = signedIn && avatar && /^https:\/\//.test(avatar) && avatar !== failedAvatar
  const nickname = signedIn ? profile.data?.nickname || (profile.isPending ? '正在读取资料' : '柴友') : '游客 · 点击登录'
  const statsError = (summary.isError && summary.error) || (count.isError && count.error) || (categories.isError && categories.error)
  function openCreate() { setName(''); action.setError(''); setCreating(true) }
  function saveLedger() {
    const value = name.trim()
    if (!value || value.length > 32) { action.setError('账本名称须为 1-32 个字符'); return }
    void action.run(signal => createLedger(value, signal), () => { setCreating(false); setName('') })
  }
  async function logout() {
    setBusy(true)
    setError('')
    try { await signOut() } catch { setError('退出未完成，请检查网络后重试') } finally { setBusy(false) }
  }
  return (
    <Screen title="我的" refreshing={signedIn && (profile.isRefetching || ledger.refreshing || summary.isRefetching || count.isRefetching || categories.isRefetching)} onRefresh={signedIn ? reload : undefined}>
      <View style={[ui.card, styles.profile]}>
        <Pressable accessibilityRole="button" accessibilityLabel={signedIn ? '编辑个人资料' : '前往登录'} onPress={() => router.push(signedIn ? '/profile' : '/login')} style={({ pressed }) => [styles.profileRow, pressed && ui.pressed]}>
          <View style={styles.avatar}>{showAvatar ? <Image source={{ uri: avatar }} accessibilityLabel="头像" onError={() => setFailedAvatar(avatar)} style={styles.avatarImage} /> : <Text style={styles.initial}>{nickname.slice(0, 1)}</Text>}</View>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text numberOfLines={2} style={styles.nickname}>{nickname}</Text><View style={styles.sync}><Cloud size={13} color={colors.income} /><Text style={styles.syncText}>{signedIn ? '已开启云同步' : '登录后保存个人账本'}</Text></View></View>
          {signedIn && <View style={styles.editIcon}><SlidersHorizontal size={20} color={colors.secondary} /></View>}
        </Pressable>
        {signedIn && <View style={styles.summary}>
          <View style={styles.stat}><Text style={styles.caption}>本月支出</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[styles.statValue, { color: colors.expense }]}>¥{formatMoney(summary.data?.expense)}</Text></View>
          <View style={styles.stat}><Text style={styles.caption}>记录流水</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={styles.statValue}>{count.data ? count.data.pagination.total : '—'}<Text style={styles.unit}> 笔</Text></Text></View>
          <View style={styles.stat}><Text style={styles.caption}>管理账本</Text><Text style={styles.statValue}>{ledger.loading || (ledger.error && !ledger.ledgers.length) ? '—' : ledger.ledgers.length}<Text style={styles.unit}> 本</Text></Text></View>
        </View>}
      </View>
      {signedIn && <>
        <ErrorNotice error={profile.isError ? profile.error : null} retry={() => void refetch()} busy={profile.isFetching} />
        <ErrorNotice error={statsError} retry={reload} busy={summary.isFetching || count.isFetching || categories.isFetching} />
        <View style={styles.ledgerSection}>
          <View style={ui.between}><View style={[ui.row, { gap: 6 }]}><Text accessibilityRole="header" style={ui.sectionTitle}>我的账本</Text><Text style={styles.count}>{ledger.loading || ledger.error ? '—' : ledger.ledgers.length}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="新建账本" onPress={openCreate} style={({ pressed }) => [styles.create, pressed && ui.pressed]}><Plus size={14} color={colors.brand} /><Text style={styles.createText}>新建账本</Text></Pressable></View>
          <ErrorNotice error={ledger.error} retry={() => void refresh()} busy={ledger.refreshing} />
          <View onLayout={event => setLedgerWidth(event.nativeEvent.layout.width)}>
            {ledger.loading ? <LoadingState label="正在读取账本" /> : ledger.ledgers.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ledgerCards}>
              {ledger.ledgers.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}，账本管理`} onPress={() => router.push('/ledgers')} style={({ pressed }) => [ui.card, styles.ledgerCard, { width: Math.max(128, (ledgerWidth - 12) / 2) }, pressed && ui.pressed]}>
                <View style={ui.between}><View style={styles.bookIcon}><BookOpen size={16} color={colors.brand} /></View><Text style={[styles.ledgerBadge, item.id === ledger.current?.id && styles.currentBadge]}>{item.id === ledger.current?.id ? '当前使用' : '账本'}</Text></View>
                <View style={{ gap: 4 }}><Text numberOfLines={2} style={styles.ledgerName}>{item.name}</Text><View style={styles.ledgerExpense}><Text style={styles.caption}>本月支出</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={styles.ledgerAmount}>¥{formatMoney(item.monthlySummary?.expense)}</Text></View></View>
              </Pressable>)}
            </ScrollView> : !ledger.error ? <Pressable accessibilityRole="button" onPress={openCreate} style={styles.emptyLedger}><BookOpen size={24} color={colors.brand} /><Text style={ui.body}>新建你的第一本账本</Text></Pressable> : null}
          </View>
        </View>
      </>}
      <View style={styles.group}>
        <Text style={styles.groupTitle}>功能偏好设置</Text>
        <View style={[ui.card, styles.settings]}>
          {[{ label: '分类管理', description: '自定义支出与收入类别', count: enabled && categories.data ? `${categories.data.length} 类` : signedIn ? '—' : '登录后管理', icon: Tags, path: '/categories' as const }, { label: '账本管理', description: '切换默认、重命名与删除账本', count: signedIn && !ledger.loading && !ledger.error ? `${ledger.ledgers.length} 本` : signedIn ? '—' : '登录后管理', icon: BookOpen, path: '/ledgers' as const }].map(({ label, description, count: detail, icon: Icon, path }, index) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={signedIn ? label : `${label}，需要登录`} onPress={() => router.push(signedIn ? path : '/login')} style={({ pressed }) => [styles.item, index > 0 && styles.separator, pressed && ui.pressed]}><View style={styles.settingIcon}><Icon size={18} color={colors.brand} /></View><View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text style={styles.itemLabel}>{label}</Text><Text style={styles.description}>{description}</Text></View><Text style={styles.itemCount}>{detail}</Text><ChevronRight size={16} color={colors.muted} /></Pressable>)}
          <View style={[styles.item, styles.separator]}><View style={styles.settingIcon}><Moon size={18} color={colors.brand} /></View><View style={{ flex: 1, gap: 3 }}><Text style={styles.itemLabel}>深色外观</Text><Text style={styles.description}>开启深色显示</Text></View><Switch accessibilityLabel="深色外观" value={dark} onValueChange={setDark} trackColor={{ false: colors.subtle, true: colors.brandAction }} thumbColor={colors.onBrand} /></View>
        </View>
        <ErrorNotice error={themeError} />
      </View>
      <View style={styles.group}>
        <Text style={styles.groupTitle}>帮助与协议</Text>
        <View style={[ui.card, styles.settings]}>{[{ label: '关于柴记账', icon: Info, path: '/about' as const, params: { document: 'app' } }, { label: '用户协议', icon: FileText, path: '/about' as const, params: { document: 'terms' } }, { label: '隐私说明', icon: Shield, path: '/about' as const, params: { document: 'privacy' } }, { label: '反馈与帮助', icon: MessageSquare, path: '/support' as const, params: undefined }].map(({ label, icon: Icon, path, params }, index) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push({ pathname: path, params })} style={({ pressed }) => [styles.item, index > 0 && styles.separator, pressed && ui.pressed]}><View style={styles.settingIcon}><Icon size={18} color={colors.brand} /></View><Text style={[styles.itemLabel, { flex: 1 }]}>{label}</Text><ChevronRight size={16} color={colors.muted} /></Pressable>)}</View>
      </View>
      {signedIn && <Pressable accessibilityRole="button" accessibilityLabel="退出登录" onPress={() => { setError(''); setConfirmLogout(true) }} style={({ pressed }) => [ui.card, styles.logout, pressed && ui.pressed]}><LogOut size={18} color={colors.expense} /><Text style={{ fontSize: 14, color: colors.expense }}>退出登录</Text></Pressable>}
      <Text style={[ui.muted, { textAlign: 'center', paddingTop: 24 }]}>柴记账 · 0.1.0</Text>
      <Sheet visible={creating && signedIn} title="新建账本" busy={action.busy} onClose={() => setCreating(false)}><Text style={ui.body}>账本名称</Text><TextInput accessibilityLabel="账本名称" value={name} onChangeText={setName} placeholder="例如：旅行基金" placeholderTextColor={colors.muted} maxLength={32} editable={!action.busy} returnKeyType="done" onSubmitEditing={saveLedger} style={ui.input} /><ErrorNotice error={action.error} /><ActionButton label={action.busy ? '正在创建' : '创建账本'} disabled={action.busy} onPress={saveLedger} /></Sheet>
      <Sheet visible={confirmLogout && signedIn} title="退出登录" busy={busy} onClose={() => setConfirmLogout(false)}><Text style={ui.body}>确定要退出当前账号吗？</Text><ErrorNotice error={error} /><ActionButton label={busy ? '正在退出' : '确认退出'} disabled={busy} icon={LogOut} onPress={() => void logout()} /><ActionButton label="取消" secondary disabled={busy} onPress={() => setConfirmLogout(false)} /></Sheet>
    </Screen>
  )
}

const useStyles = themedStyles(colors => StyleSheet.create({
  profile: { padding: 20, marginBottom: 16 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  avatar: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', backgroundColor: colors.container, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 56, height: 56 },
  initial: { fontSize: 20, fontWeight: '700', color: colors.brand },
  nickname: { fontSize: 18, fontWeight: '700', color: colors.ink },
  sync: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncText: { flexShrink: 1, fontSize: 12, lineHeight: 18, color: colors.secondary },
  editIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.subtle, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', marginTop: 16, gap: 8, padding: 12, borderRadius: 16, backgroundColor: colors.subtle },
  stat: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4 },
  caption: { fontSize: 12, lineHeight: 18, color: colors.secondary },
  statValue: { fontSize: 15, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'], maxWidth: '100%' },
  unit: { fontSize: 11, fontWeight: '400', color: colors.secondary },
  ledgerSection: { marginBottom: 16 },
  count: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 12, backgroundColor: colors.container, fontSize: 11, color: colors.secondary, overflow: 'hidden' },
  create: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  createText: { fontSize: 13, color: colors.brand },
  ledgerCards: { gap: 12, paddingBottom: 8 },
  ledgerCard: { minHeight: 140, padding: 14, justifyContent: 'space-between', gap: 12 },
  bookIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  ledgerBadge: { fontSize: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, color: colors.secondary, backgroundColor: colors.subtle, overflow: 'hidden' },
  currentBadge: { backgroundColor: colors.brand, color: colors.surface },
  ledgerName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  ledgerExpense: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4 },
  ledgerAmount: { maxWidth: '100%', fontSize: 12, fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'] },
  emptyLedger: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 12 },
  group: { marginBottom: 16 },
  groupTitle: { fontSize: 13, color: colors.secondary, paddingHorizontal: 4, marginBottom: 6 },
  settings: { paddingHorizontal: 16, paddingVertical: 4 },
  item: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  settingIcon: { width: 36, height: 36, marginRight: 4, borderRadius: 18, backgroundColor: colors.subtle, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { fontSize: 14, fontWeight: '500', color: colors.ink },
  description: { fontSize: 12, lineHeight: 18, color: colors.secondary },
  itemCount: { fontSize: 11, color: colors.muted, maxWidth: 66 },
  logout: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
}))
