import { useEffect, useRef, useState } from 'react'
import { Keyboard, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Check, ChevronDown, Delete, Pencil, Plus, Tags, Trash2, X } from 'lucide-react-native'
import { ActionButton, EmptyState, IconButton, PanelScreen, Segments } from '../src/components/Screen'
import { CategorySymbol, ChoiceSheet, ConfirmDelete, DateField, ErrorNotice, LoadingState, LoginRequired, Sheet, useBookkeepingAction } from '../src/components/Bookkeeping'
import { getCategories } from '../src/api/categories'
import type { TransactionType } from '../src/api/categories'
import { createTransaction, deleteTransaction, getTransaction, updateTransaction } from '../src/api/transactions'
import type { Transaction } from '../src/api/transactions'
import { normalizeAmount, todayKey, validDate } from '../src/lib/bookkeeping'
import { useLedger } from '../src/providers/LedgerProvider'
import { useTheme } from '../src/theme'
import { useUnsavedChanges } from '../src/hooks/useUnsavedChanges'
import { cents, moneyFromCents } from '../src/lib/insights'

export function nextAmountExpression(value: string, key: string) {
  if (key === 'backspace') return value.slice(0, -1)
  if (value.length >= 96) return value
  if (key === '+' || key === '-') return value && !/[+.-]$/.test(value) ? value + key : value
  if (!/^[0-9.]$/.test(key)) return value
  const part = value.split(/[+-]/).pop() || ''
  if (key === '.') return part.includes('.') ? value : value + (part ? '.' : '0.')
  if (part.includes('.') ? part.split('.')[1].length >= 2 : part.length >= 14) return value
  return part === '0' ? value.slice(0, -1) + key : value + key
}

export function resolveAmountExpression(value: string) {
  const expression = value.replace(/[+-]$/, '')
  if (!/^\d{1,14}(\.\d{0,2})?([+-]\d{1,14}(\.\d{0,2})?)*$/.test(expression)) return null
  const terms = expression.match(/[+-]?\d+(?:\.\d{0,2})?/g) || []
  const result = terms.reduce((total, term) => total + cents(term.replace(/^\+/, '').replace(/\.$/, '')), 0n)
  return normalizeAmount(moneyFromCents(result))
}

export default function RecordPage() {
  const params = useLocalSearchParams<{ id?: string }>()
  const id = typeof params.id === 'string' && params.id ? params.id : undefined
  const { generation } = useLedger()
  return <RecordBody key={`${generation}:${id || 'new'}`} id={id} />
}

function RecordBody({ id }: { id?: string }) {
  const ledger = useLedger()
  const detail = useQuery({ queryKey: ['transaction', ledger.generation, id], queryFn: ({ signal }) => getTransaction(id!, signal), enabled: ledger.signedIn && !!id, retry: false })
  return <PanelScreen title={id ? '流水详情' : '记一笔'} scroll={false}>
    {!ledger.signedIn ? <LoginRequired /> : ledger.loading || (id && detail.isPending) ? <LoadingState /> : <>
      <ErrorNotice error={ledger.error} retry={() => void ledger.refresh()} busy={ledger.refreshing} />
      {id && detail.isError ? <ErrorNotice error={detail.error} retry={() => void detail.refetch()} busy={detail.isFetching} /> : !ledger.ledgers.length ? !ledger.error && <View><EmptyState icon={BookOpen} title="还没有账本" message="先创建一个账本。" login={false} /><ActionButton label="创建账本" icon={Plus} onPress={() => router.push('/ledgers')} /></View> : <RecordForm initial={detail.data} />}
    </>}
  </PanelScreen>
}

function RecordForm({ initial }: { initial?: Transaction }) {
  const { colors, ui } = useTheme()
  const viewport = useWindowDimensions()
  const ledger = useLedger()
  const action = useBookkeepingAction()
  const [type, setType] = useState<TransactionType>(initial?.type || 'EXPENSE')
  const [ledgerId, setLedgerId] = useState(initial?.ledgerId || ledger.current?.id || '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId || '')
  const [amount, setAmount] = useState(initial?.amount || '')
  const [date, setDate] = useState(initial?.date.slice(0, 10) || todayKey())
  const [remark, setRemark] = useState(initial?.remark || '')
  const [picker, setPicker] = useState<'ledger' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(!initial)
  const [expanded, setExpanded] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const landscape = viewport.width >= 600 && viewport.width > viewport.height && !keyboardVisible
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false))
    return () => { show.remove(); hide.remove() }
  }, [])
  const baseline = useRef({ type, ledgerId, categoryId, amount, date, remark })
  const dirty = type !== baseline.current.type || ledgerId !== baseline.current.ledgerId || categoryId !== baseline.current.categoryId || amount !== baseline.current.amount || date !== baseline.current.date || remark !== baseline.current.remark
  const guard = useUnsavedChanges(dirty, action.busy)
  const selectedLedger = ledger.ledgers.find(item => item.id === ledgerId)
  const categories = useQuery({ queryKey: ['categories', ledger.generation, ledgerId], queryFn: ({ signal }) => getCategories(ledgerId, signal), enabled: !!selectedLedger })
  const available = (categories.data || []).filter(item => item.type === type && item.isActive !== false && !item.deletedAt)
  const chosenId = categoryId || available[0]?.id || ''
  const category = available.find(item => item.id === chosenId)
  function finish() { guard.complete(() => { if (router.canGoBack()) router.back(); else router.replace('/') }) }
  function save() {
    const normalized = resolveAmountExpression(amount)
    if (!normalized) { action.setError('请输入大于 0 的金额，最多 14 位整数和两位小数'); return }
    if (!validDate(date)) { action.setError('请选择有效日期，格式为 YYYY-MM-DD'); return }
    if (!selectedLedger) { action.setError('请选择可用账本'); return }
    if (!category) { action.setError('请选择当前收支类型下的可用分类'); return }
    if (remark.length > 200) { action.setError('备注不能超过 200 个字符'); return }
    const data = { ledgerId, categoryId: chosenId, type, amount: normalized, date, remark: remark.trim() }
    void action.run(signal => initial ? updateTransaction(initial.id, data, signal) : createTransaction(data, signal), () => { ledger.select(ledgerId); finish() })
  }
  return <View style={{ flex: 1, flexDirection: landscape ? 'row' : 'column' }}>
    <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Segments options={['支出', '收入']} value={type === 'EXPENSE' ? '支出' : '收入'} disabled={!editing || action.busy} onChange={value => { const next = value === '支出' ? 'EXPENSE' : 'INCOME'; if (next !== type) { setType(next); setCategoryId(''); setExpanded(false) } }} />
      <View style={[ui.row, { paddingVertical: 8 }]}>
        <Text style={[ui.amount, { fontSize: 26 }]}>¥</Text><Text accessibilityLabel={`金额：${amount || '0.00'}`} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.5} style={[ui.amount, { flex: 1, fontSize: 32 }]}>{amount || '0.00'}</Text>
        {editing && <IconButton label="清空金额" icon={X} disabled={action.busy} onPress={() => setAmount('')} />}
      </View>
      <View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}>
        <DateField compact value={date} onChange={setDate} disabled={!editing || action.busy} />
        <Pressable accessibilityRole="button" accessibilityLabel={`选择账本：${selectedLedger?.name || '不可用'}`} disabled={!editing || action.busy} onPress={() => setPicker('ledger')} style={({ pressed }) => [{ maxWidth: '100%', minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 12, borderRadius: 22, backgroundColor: colors.subtle }, pressed && ui.pressed]}><BookOpen size={16} color={colors.brand} /><Text numberOfLines={1} style={[ui.body, { flexShrink: 1 }]}>{selectedLedger?.name || '账本已不可用'}</Text>{editing && <ChevronDown size={14} color={colors.muted} />}</Pressable>
      </View>
      <View style={[ui.row, { backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 12 }]}><Pencil size={18} color={colors.muted} /><TextInput accessibilityLabel="备注" value={remark} onChangeText={setRemark} editable={editing && !action.busy} placeholder="添加备注（如：和同事聚餐、打车）" placeholderTextColor={colors.muted} maxLength={200} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} style={[ui.body, { minHeight: 48, flex: 1, minWidth: 0, paddingVertical: 12 }]} /></View>
      <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 12, gap: 8 }}>
        <View style={ui.between}><Text style={ui.muted}>{editing ? '选择分类' : '分类'}</Text>{editing && available.length > 8 && <Pressable accessibilityRole="button" onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.brand }}>{expanded ? '收起分类' : '全部分类'}</Text></Pressable>}</View>
        {categories.isPending && <LoadingState label="正在加载分类" />}
        <ErrorNotice error={categories.isError ? categories.error : null} retry={() => void categories.refetch()} busy={categories.isFetching} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{(editing ? expanded ? available : available.slice(0, 8) : [category || initial?.category].filter(Boolean)).map(item => item && <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ checked: chosenId === item.id, disabled: !editing || action.busy }} disabled={!editing || action.busy} onPress={() => setCategoryId(item.id)} style={({ pressed }) => [{ width: '25%', minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 4, borderRadius: 14, backgroundColor: chosenId === item.id ? colors.brandSoft : 'transparent' }, pressed && ui.pressed]}><CategorySymbol category={item} /><Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 16, textAlign: 'center', color: chosenId === item.id ? colors.brand : colors.secondary }}>{item.name}</Text></Pressable>)}</View>
        {editing && categories.isSuccess && !available.length && <ActionButton label="添加分类" icon={Tags} secondary disabled={action.busy} onPress={() => router.push('/categories')} />}
        {editing && !!categoryId && !category && <Text style={{ color: colors.expense }}>原分类已不可用，请重新选择</Text>}
      </View>
      {initial && editing && <ActionButton label="删除流水" icon={Trash2} secondary disabled={action.busy} onPress={() => { action.setError(''); setDeleting(true) }} />}
    </ScrollView>
    <View style={{ paddingHorizontal: 16 }}><ErrorNotice error={!deleting ? action.error : null} /></View></View>
    {!keyboardVisible && <View style={{ padding: 12, paddingTop: 4, width: landscape ? 280 : undefined, justifyContent: 'center' }}>
      {editing ? <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 10, gap: 8 }}>
        {[['1', '2', '3', 'today'], ['4', '5', '6', '+'], ['7', '8', '9', '-'], ['.', '0', 'backspace', 'done']].map((row, index) => <View key={index} style={[ui.row, { gap: 8 }]}>{row.map(key => <Pressable key={key} accessibilityRole="button" accessibilityLabel={key === 'done' ? '保存记账' : key === 'backspace' ? '退格' : key === 'today' ? '今天' : key} disabled={action.busy || key === 'done' && (categories.isPending || !selectedLedger)} onPress={() => key === 'done' ? save() : key === 'today' ? setDate(todayKey()) : setAmount(value => nextAmountExpression(value, key))} style={({ pressed }) => [{ flex: 1, minWidth: 0, minHeight: 48, borderRadius: 14, backgroundColor: key === 'done' ? colors.brandAction : colors.subtle, alignItems: 'center', justifyContent: 'center', opacity: action.busy ? 0.5 : 1 }, pressed && ui.pressed]}>{key === 'backspace' ? <Delete size={22} color={colors.secondary} /> : key === 'done' ? <View style={{ alignItems: 'center', gap: 2 }}><Check size={18} color={colors.onBrand} /><Text style={{ color: colors.onBrand, fontSize: 12 }}>{action.busy ? '保存中' : '完成'}</Text></View> : <Text style={{ fontSize: key === 'today' ? 14 : 22, color: key === 'today' ? colors.brand : colors.ink }}>{key === 'today' ? '今天' : key}</Text>}</Pressable>)}</View>)}
      </View> : <ActionButton label="编辑此条" icon={Pencil} onPress={() => setEditing(true)} />}
    </View>}
    <ChoiceSheet visible={picker === 'ledger'} title="选择账本" value={ledgerId} options={ledger.ledgers.map(item => ({ value: item.id, label: item.name }))} onClose={() => setPicker(null)} onChange={id => { setLedgerId(id); setCategoryId('') }} />
    <ConfirmDelete visible={deleting} title="删除流水" message="确定删除这笔流水？删除后将从明细和统计中移除。" busy={action.busy} error={action.error} onClose={() => setDeleting(false)} onConfirm={() => { if (initial) void action.run(signal => deleteTransaction(initial.id, signal), finish) }} />
    <Sheet visible={guard.confirming} title="放弃未保存的记账？" onClose={guard.keepEditing}><Text style={ui.body}>本次未保存的输入将被丢弃，已有流水不受影响。</Text><ActionButton label="继续编辑" icon={Pencil} onPress={guard.keepEditing} /><ActionButton label="放弃修改" icon={X} secondary onPress={guard.discard} /></Sheet>
  </View>
}
