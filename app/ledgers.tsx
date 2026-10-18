import { useCallback, useState } from 'react'
import { FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { BookOpen, Check, Pencil, Plus, Star, Trash2 } from 'lucide-react-native'
import { createLedger, deleteLedger, setDefaultLedger, updateLedger } from '../src/api/ledgers'
import type { Ledger } from '../src/api/ledgers'
import { ConfirmDelete, ErrorNotice, LoadingState, LoginRequired, Sheet, useBookkeepingAction } from '../src/components/Bookkeeping'
import { ActionButton, EmptyState, IconButton, Screen } from '../src/components/Screen'
import { formatMoney } from '../src/lib/bookkeeping'
import { useLedger } from '../src/providers/LedgerProvider'
import { useTheme } from '../src/theme'

export default function LedgersPage() {
  const { generation } = useLedger()
  return <LedgerManager key={generation} />
}

function LedgerManager() {
  const { colors, ui } = useTheme()
  const ledger = useLedger()
  const { signedIn, refresh } = ledger
  const action = useBookkeepingAction()
  const [editor, setEditor] = useState<{ item?: Ledger } | null>(null)
  const [deleting, setDeleting] = useState<Ledger | null>(null)
  const [name, setName] = useState('')
  useFocusEffect(useCallback(() => { if (signedIn) void refresh() }, [signedIn, refresh]))
  function edit(item?: Ledger) { action.setError(''); setName(item?.name || ''); setEditor({ item }) }
  function save() {
    const value = name.trim()
    if (!value || value.length > 32) { action.setError('账本名称须为 1-32 个字符'); return }
    void action.run(signal => editor?.item ? updateLedger(editor.item.id, value, signal) : createLedger(value, signal), result => {
      if (!editor?.item) ledger.select(result.id)
      setEditor(null)
    })
  }
  return <Screen title="账本管理" back scroll={false}>
    {!signedIn ? <LoginRequired /> : <FlatList data={ledger.ledgers} keyExtractor={item => item.id} refreshing={ledger.refreshing} onRefresh={() => void refresh()} contentContainerStyle={{ paddingBottom: 32 }}
      ListHeaderComponent={<><Text style={[ui.muted, { paddingVertical: 12 }]}>我的账本 · {ledger.ledgers.length} 本</Text><ErrorNotice error={ledger.error} retry={() => void refresh()} busy={ledger.refreshing} />{!editor && !deleting && <ErrorNotice error={action.error} />}</>}
      ListEmptyComponent={ledger.loading ? <LoadingState /> : !ledger.error ? <EmptyState icon={BookOpen} title="还没有账本" message="从第一本账本开始。" login={false} /> : null}
      renderItem={({ item }) => <View style={[ui.card, { padding: 20, gap: 16, marginBottom: 12, borderWidth: 1, borderColor: item.isDefault ? colors.brandSoft : 'transparent' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`切换到${item.name}`} accessibilityState={{ selected: ledger.current?.id === item.id }} onPress={() => ledger.select(item.id)} style={({ pressed }) => [ui.row, pressed && ui.pressed]}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><BookOpen size={22} color={colors.brand} /></View><View style={{ flex: 1, minWidth: 0, gap: 6 }}><Text style={ui.sectionTitle}>{item.name}</Text><Text style={ui.muted}>{item.isDefault ? '默认账本' : '账本'}{ledger.current?.id === item.id ? ' · 当前使用' : ''}</Text></View>{ledger.current?.id === item.id && <Check size={22} color={colors.income} />}
        </Pressable>
        <View style={[ui.row, { padding: 12, borderRadius: 16, backgroundColor: colors.subtle }]}>{[{ label: '本月收入', amount: item.monthlySummary?.income, color: colors.income }, { label: '本月支出', amount: item.monthlySummary?.expense, color: colors.expense }].map(value => <View key={value.label} style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={ui.muted}>{value.label}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: value.color, fontSize: 15, fontWeight: '700' }}>¥{formatMoney(value.amount)}</Text></View>)}</View>
        <View style={[ui.row, { justifyContent: 'flex-end' }]}>
          <IconButton label={`编辑${item.name}`} icon={Pencil} disabled={action.busy} onPress={() => edit(item)} />
          <IconButton label={`将${item.name}设为默认`} icon={Star} disabled={action.busy || item.isDefault} onPress={() => void action.run(signal => setDefaultLedger(item.id, signal), () => ledger.select(item.id))} />
          <IconButton label={`删除${item.name}`} icon={Trash2} disabled={action.busy || item.isDefault} onPress={() => { action.setError(''); setDeleting(item) }} />
        </View>
      </View>} />}
    {signedIn && <View style={{ paddingVertical: 12 }}><ActionButton label="新增账本" icon={Plus} disabled={action.busy} onPress={() => edit()} /></View>}
    <Sheet visible={!!editor} title={editor?.item ? '编辑账本' : '新增账本'} busy={action.busy} onClose={() => setEditor(null)}>
      <Text style={ui.body}>账本名称</Text><TextInput accessibilityLabel="账本名称" autoFocus value={name} onChangeText={setName} maxLength={32} editable={!action.busy} returnKeyType="done" onSubmitEditing={save} style={ui.input} />
      <ErrorNotice error={action.error} /><ActionButton label={action.busy ? '正在保存' : '保存账本'} disabled={action.busy} onPress={save} />
    </Sheet>
    <ConfirmDelete visible={!!deleting} title="删除账本" message={`确定删除“${deleting?.name || ''}”？默认账本或仍有流水的账本不能删除。`} busy={action.busy} error={action.error} onClose={() => setDeleting(null)} onConfirm={() => { if (deleting) void action.run(signal => deleteLedger(deleting.id, signal), () => setDeleting(null)) }} />
  </Screen>
}
