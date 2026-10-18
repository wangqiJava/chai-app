import { useCallback, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Lightbulb, Pencil, Plus, Save, Trash2, Wallet } from 'lucide-react-native'
import { createBudget, deleteBudget, getBudgets, updateBudget } from '../../src/api/budgets'
import type { Budget } from '../../src/api/budgets'
import { getCategories } from '../../src/api/categories'
import { getMonthlySummary } from '../../src/api/stats'
import { CategorySymbol, ChoiceSheet, ConfirmDelete, ErrorNotice, LoadingState, LoginRequired, SelectionField, Sheet, useBookkeepingAction } from '../../src/components/Bookkeeping'
import { ActionButton, EmptyState, IconButton, MonthPicker, Screen, useMonth } from '../../src/components/Screen'
import { formatMoney, monthKey, normalizeAmount } from '../../src/lib/bookkeeping'
import { averageMoney, budgetProgress, cents, moneyFromCents, remainingDays } from '../../src/lib/insights'
import { queryClient } from '../../src/lib/query-client'
import { useLedger } from '../../src/providers/LedgerProvider'
import { useTheme } from '../../src/theme'

export default function BudgetPage() {
  const { generation } = useLedger()
  return <BudgetManager key={generation} />
}

function BudgetManager() {
  const { colors, ui } = useTheme()
  const ledger = useLedger()
  const month = useMonth()
  const selectedMonth = monthKey(month.month)
  const [choosing, setChoosing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const refreshBudgets = useCallback(() => queryClient.invalidateQueries({ predicate: query => ['budgets', 'summary', 'categories'].includes(String(query.queryKey[0])) }), [])
  const { signedIn, refresh } = ledger
  useFocusEffect(useCallback(() => { if (signedIn) { void refresh(); void refreshBudgets() } }, [signedIn, refresh, refreshBudgets]))
  async function reload() {
    setRefreshing(true)
    try { await Promise.all([refresh(), refreshBudgets()]) } finally { setRefreshing(false) }
  }
  function move(offset: number) {
    const next = new Date(month.month.getFullYear(), month.month.getMonth() + offset, 1)
    if (next.getFullYear() >= 1900 && next.getFullYear() <= 9999) month.move(offset)
  }
  return <Screen title="预算" subtitle="花得有数，心里有底" refreshing={refreshing} onRefresh={signedIn ? () => void reload() : undefined}>
    {!signedIn ? <LoginRequired /> : <>
      <ErrorNotice error={ledger.error} retry={() => void reload()} busy={refreshing} />
      {ledger.loading ? <LoadingState /> : ledger.current ? <>
        <View style={[ui.between, { marginBottom: 16, gap: 8 }]}><View style={{ flex: 1, minWidth: 0 }}><SelectionField compact label="账本" value={ledger.current.name} hideLabel onPress={() => setChoosing(true)} /></View><MonthPicker compact month={month.month} select={month.select} label={month.label} move={move} /></View>
        <BudgetContent key={`${ledger.current.id}:${selectedMonth}`} ledgerId={ledger.current.id} month={selectedMonth} generation={ledger.generation} />
      </> : !ledger.error && <><EmptyState icon={BookOpen} title="还没有账本" message="创建账本后设置预算。" login={false} /><ActionButton label="管理账本" icon={BookOpen} onPress={() => router.push('/ledgers')} /></>}
    </>}
    <ChoiceSheet visible={choosing} title="选择账本" options={ledger.ledgers.map(item => ({ value: item.id, label: item.name }))} value={ledger.current?.id || ''} onChange={ledger.select} onClose={() => setChoosing(false)} />
  </Screen>
}

function BudgetContent({ ledgerId, month, generation }: { ledgerId: string, month: string, generation: number }) {
  const { colors, ui } = useTheme()
  const action = useBookkeepingAction()
  const [editor, setEditor] = useState<{ kind: 'total' | 'category', item?: Budget } | null>(null)
  const [deleting, setDeleting] = useState<Budget | null>(null)
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const budgets = useQuery({ queryKey: ['budgets', generation, ledgerId, month], queryFn: ({ signal }) => getBudgets(ledgerId, month, signal) })
  const summary = useQuery({ queryKey: ['summary', generation, ledgerId, month], queryFn: ({ signal }) => getMonthlySummary(ledgerId, month, signal) })
  const needsCategory = editor?.kind === 'category' && !editor.item
  const categories = useQuery({ queryKey: ['categories', generation, ledgerId], queryFn: ({ signal }) => getCategories(ledgerId, signal), enabled: needsCategory })
  const total = budgets.data?.find(item => !item.categoryId)
  const categoryBudgets = budgets.data?.filter(item => !!item.categoryId) || []
  const available = (categories.data || []).filter(item => item.type === 'EXPENSE' && item.isActive !== false && !item.deletedAt && !categoryBudgets.some(budget => budget.categoryId === item.id))
  const disabled = action.busy || budgets.isFetching || budgets.isError
  function edit(kind: 'total' | 'category', item?: Budget) {
    action.setError(''); setAmount(item?.amount || ''); setCategoryId(item?.categoryId || ''); setEditor({ kind, item })
  }
  function save() {
    if (!editor || disabled) return
    const value = normalizeAmount(amount.trim())
    if (!value) { action.setError('请输入大于 0 的金额，最多 14 位整数和 2 位小数'); return }
    if (needsCategory && (categories.isError || categories.isFetching || !available.some(item => item.id === categoryId))) { action.setError('请选择一个可用的支出分类'); return }
    if (!editor.item && editor.kind === 'total' && total) { action.setError('本月已有总预算，请关闭后重新编辑'); return }
    void action.run(signal => editor.item ? updateBudget(editor.item.id, value, signal) : createBudget({ ledgerId, month, amount: value, ...(editor.kind === 'category' ? { categoryId } : {}) }, signal), () => setEditor(null))
  }
  function askDelete(item: Budget) { action.setError(''); setDeleting(item) }
  const days = remainingDays(month)
  return <>
    <ErrorNotice error={budgets.isError ? budgets.error : null} retry={() => void budgets.refetch()} busy={budgets.isFetching} />
    {!editor && !deleting && <ErrorNotice error={action.error} />}
    {budgets.isPending ? <LoadingState /> : budgets.data && <>
      <View style={[ui.card, { padding: 20, gap: 12, borderWidth: 1, borderColor: colors.warmSoft }]}>
        <View style={ui.between}><Text accessibilityRole="header" style={[ui.sectionTitle, { flex: 1 }]}>月度总预算</Text><View style={[ui.row, { gap: 0 }]}><IconButton label={total ? '编辑总预算' : '设置总预算'} icon={total ? Pencil : Plus} disabled={disabled} onPress={() => edit('total', total)} />{total && <IconButton label="删除总预算" icon={Trash2} disabled={disabled} onPress={() => askDelete(total)} />}</View></View>
        {total ? <>
          <BudgetAmounts item={total} days={days} />
          <Text style={ui.muted}>{days > 0 ? `剩余 ${days} 天` : '该月份已结束'}</Text>
        </> : <>
          <Text style={ui.body}>尚未设置总预算</Text>
          <ErrorNotice error={summary.isError ? summary.error : null} retry={() => void summary.refetch()} busy={summary.isFetching} />
          <Text style={ui.muted}>本月已支出 ¥{formatMoney(summary.data?.expense)}</Text>
          <ActionButton label="设置总预算" icon={Plus} disabled={disabled} onPress={() => edit('total')} />
        </>}
      </View>
      {total && <View style={[ui.row, { marginTop: 16, padding: 16, borderRadius: 24, backgroundColor: colors.warmSoft, alignItems: 'flex-start' }]}><Lightbulb size={24} color={colors.warm} /><View style={{ flex: 1, gap: 6 }}><Text style={[ui.sectionTitle, { color: colors.warm }]}>预算洞察与提醒</Text><Text style={[ui.body, { color: colors.warm }]}>{days === 0 ? '该月份已结束，可回顾支出与预算的差额。' : cents(total.remaining) < 0n ? `本月已超支 ¥${formatMoney(moneyFromCents(-cents(total.remaining)))}，请留意后续支出。` : budgetProgress(total.amount, total.spent).warning ? `预算已使用 ${budgetProgress(total.amount, total.spent).label}，接近上限，请控制剩余 ${days} 天的支出。` : `剩余预算 ¥${formatMoney(total.remaining)}，日均可用 ¥${formatMoney(averageMoney(total.remaining, days))}。`}</Text></View></View>}
      <View style={[ui.section, { borderBottomWidth: 0 }]}><View style={ui.between}><Text accessibilityRole="header" style={[ui.sectionTitle, { flex: 1 }]}>分类预算（{categoryBudgets.length}）</Text><IconButton label="新增分类预算" icon={Plus} disabled={disabled} onPress={() => edit('category')} /></View>
        {!categoryBudgets.length && <EmptyState icon={Wallet} title="暂无分类预算" message="为常用支出分类设置预算。" login={false} />}
        {categoryBudgets.map(item => <View key={item.id} style={[ui.card, { padding: 16, gap: 12, borderWidth: 1, borderColor: budgetProgress(item.amount, item.spent).warning ? colors.warm : 'transparent' }]}>
          <View style={[ui.between, { gap: 6 }]}><CategorySymbol category={item.category ? { ...item.category, type: 'EXPENSE' } : null} /><Text style={[ui.sectionTitle, { flex: 1, fontSize: 14 }]}>{item.category?.name || '已停用分类'}</Text><View style={[ui.row, { gap: 0 }]}><IconButton label={`编辑${item.category?.name || '已停用分类'}预算`} icon={Pencil} disabled={disabled} onPress={() => edit('category', item)} /><IconButton label={`删除${item.category?.name || '已停用分类'}预算`} icon={Trash2} disabled={disabled} onPress={() => askDelete(item)} /></View></View>
          <BudgetAmounts item={item} compact />
        </View>)}
      </View>
      <ActionButton label="调整预算额度" icon={Pencil} secondary disabled={disabled} onPress={() => edit('total', total)} />
    </>}
    <Sheet visible={!!editor} title={editor?.kind === 'total' ? '设置总预算' : editor?.item ? '编辑分类预算' : '新增分类预算'} busy={action.busy} onClose={() => setEditor(null)}>
      <Text style={ui.muted}>{month}</Text>
      {needsCategory ? <>
        <ErrorNotice error={categories.isError ? categories.error : null} retry={() => void categories.refetch()} busy={categories.isFetching} />
        {categories.isPending ? <LoadingState /> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{available.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ checked: categoryId === item.id }} disabled={action.busy || categories.isError} onPress={() => setCategoryId(item.id)} style={({ pressed }) => [{ minHeight: 44, maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, backgroundColor: categoryId === item.id ? colors.brandSoft : colors.surface }, pressed && ui.pressed]}><Text style={{ color: categoryId === item.id ? colors.brand : colors.secondary }}>{item.name}</Text></Pressable>)}</View>}
        {!categories.isPending && !categories.isError && !available.length && <Text style={ui.muted}>没有可新增预算的支出分类</Text>}
      </> : editor?.item?.categoryId ? <Text style={ui.body}>{editor.item.category?.name || '已停用分类'}</Text> : null}
      <Text style={ui.body}>预算金额（元）</Text><TextInput accessibilityLabel="预算金额" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!action.busy} maxLength={17} returnKeyType="done" onSubmitEditing={save} style={ui.input} />
      <ErrorNotice error={action.error} /><ActionButton label={action.busy ? '正在保存' : '保存预算'} icon={Save} disabled={disabled || !!needsCategory && (categories.isPending || categories.isError || categories.isFetching || !available.length)} onPress={save} />
    </Sheet>
    <ConfirmDelete visible={!!deleting} title="删除预算" message={`删除${month}的${deleting?.categoryId ? deleting.category?.name || '已停用分类' : '总'}预算？已有收支记录不会删除。`} busy={action.busy} error={action.error} onClose={() => setDeleting(null)} onConfirm={() => { if (deleting) void action.run(signal => deleteBudget(deleting.id, signal), () => setDeleting(null)) }} />
  </>
}

function BudgetAmounts({ item, compact = false, days }: { item: Budget, compact?: boolean, days?: number }) {
  const { colors, ui } = useTheme()
  const progress = budgetProgress(item.amount, item.spent)
  const color = progress.over ? colors.expense : progress.warning ? colors.warm : colors.brand
  const remaining = cents(item.remaining)
  return <View style={{ gap: 12 }}>
    {!compact && <><Text style={ui.body}>{remaining < 0n ? '已超支' : '剩余可用额度'}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[ui.amount, { fontSize: 34, color: remaining < 0n ? colors.expense : colors.ink }]}>¥{formatMoney(moneyFromCents(remaining < 0n ? -remaining : remaining))}</Text></>}
    <View style={[ui.between, { flexWrap: 'wrap' }]}><Text style={ui.body}>预算 ¥{formatMoney(item.amount)}</Text><Text style={ui.body}>已支出 ¥{formatMoney(item.spent)}</Text></View>
    <View accessibilityRole="progressbar" accessibilityLabel="预算使用进度" accessibilityValue={{ min: 0, max: 100, now: progress.percent, text: `已使用 ${progress.label}${progress.over ? '，已超支' : ''}` }} style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.line }}><View style={{ height: 8, width: `${progress.percent}%`, backgroundColor: color }} /></View>
    <Text style={[ui.muted, { color }]}>已使用 {progress.label}{progress.over ? ' · 已超支' : progress.warning ? ' · 接近预算上限' : ''}</Text>
    {compact ? <Text style={ui.muted}>{remaining < 0n ? '超支' : '还剩'} ¥{formatMoney(moneyFromCents(remaining < 0n ? -remaining : remaining))}</Text> : <View style={[ui.row, { backgroundColor: colors.subtle, padding: 12, borderRadius: 20, gap: 8 }]}>{[{ label: '总预算额', value: item.amount }, { label: '已支出', value: item.spent }, { label: '日均可用', value: days ? averageMoney(remaining > 0n ? item.remaining : '0.00', days) : '0.00' }].map(entry => <View key={entry.label} style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={[ui.muted, { fontSize: 11 }]}>{entry.label}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>¥{formatMoney(entry.value)}</Text></View>)}</View>}
  </View>
}
