import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, SectionList, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { BookOpen, Check, ChevronDown, PiggyBank, Plus, ReceiptText } from 'lucide-react-native'
import { ActionButton, EmptyState, MonthPicker, Screen, useMonth } from '../../src/components/Screen'
import { useTheme, themedStyles } from '../../src/theme'
import { getTransactions } from '../../src/api/transactions'
import type { Transaction } from '../../src/api/transactions'
import { getCategories } from '../../src/api/categories'
import { getMonthlySummary } from '../../src/api/stats'
import { CategorySymbol, ErrorNotice, LoadingState, LoginRequired } from '../../src/components/Bookkeeping'
import { formatMoney, mergeTransactionPages, monthKey, nextTransactionPage, todayKey } from '../../src/lib/bookkeeping'
import { queryClient } from '../../src/lib/query-client'
import { useLedger } from '../../src/providers/LedgerProvider'
import { getBudgets } from '../../src/api/budgets'
import { cents, changePercent, moneyFromCents, previousMonth } from '../../src/lib/insights'

function groupTitle(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const prefix = value === todayKey() ? '今天 · ' : value === todayKey(yesterday) ? '昨天 · ' : ''
  return `${prefix}${date.getMonth() + 1}月${date.getDate()}日 星期${'日一二三四五六'[date.getDay()]}`
}

function transactionTime(item: Transaction) {
  const value = 'createdAt' in item && typeof item.createdAt === 'string' ? new Date(item.createdAt) : null
  return value && !Number.isNaN(value.getTime()) ? `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}` : ''
}

const TransactionRow = memo(function TransactionRow({ item, first, last }: { item: Transaction, first: boolean, last: boolean }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  const category = item.category?.name || '未分类'
  const detail = [item.remark ? category : '', transactionTime(item)].filter(Boolean).join(' · ')
  return <Pressable accessibilityRole="button" accessibilityLabel={`${category}，${item.type === 'EXPENSE' ? '支出' : '收入'}${item.amount}元，查看流水`} onPress={() => router.push({ pathname: '/record', params: { id: item.id } })} style={({ pressed }) => [styles.transaction, first && styles.firstRow, last && styles.lastRow, pressed && ui.pressed]}>
    <CategorySymbol category={item.category} /><View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text numberOfLines={1} style={styles.transactionTitle}>{item.remark || category}</Text>{!!detail && <Text numberOfLines={1} style={styles.transactionDetail}>{detail}</Text>}</View>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[styles.transactionAmount, { color: item.type === 'EXPENSE' ? colors.ink : colors.income }]}>{item.type === 'EXPENSE' ? '-' : '+'}¥{formatMoney(item.amount)}</Text>
  </Pressable>
})

export default function DetailsPage() {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  const month = useMonth()
  const ledger = useLedger()
  const { signedIn, generation, refresh } = ledger
  const ledgerId = ledger.current?.id || ''
  const selectedMonth = monthKey(month.month)
  const [picker, setPicker] = useState(false)
  const anchor = useRef<View>(null)
  const [menuPosition, setMenuPosition] = useState({ left: 16, top: 100 })
  const viewport = useWindowDimensions()
  const [filter, setFilter] = useState<{ ledgerId: string, categoryId: string } | null>(null)
  const categoryId = filter?.ledgerId === ledgerId ? filter.categoryId || undefined : undefined
  const enabled = signedIn && !!ledgerId
  const categories = useQuery({ queryKey: ['categories', generation, ledgerId], queryFn: ({ signal }) => getCategories(ledgerId, signal), enabled })
  const summary = useQuery({ queryKey: ['summary', generation, ledgerId, selectedMonth], queryFn: ({ signal }) => getMonthlySummary(ledgerId, selectedMonth, signal), enabled })
  const priorMonth = previousMonth(selectedMonth)
  const prior = useQuery({ queryKey: ['summary', generation, ledgerId, priorMonth], queryFn: ({ signal }) => getMonthlySummary(ledgerId, priorMonth, signal), enabled })
  const budgets = useQuery({ queryKey: ['budgets', generation, ledgerId, selectedMonth], queryFn: ({ signal }) => getBudgets(ledgerId, selectedMonth, signal), enabled })
  const totalBudget = budgets.data?.find(item => !item.categoryId)
  const availablePercent = totalBudget && cents(totalBudget.amount) > 0n ? Math.round(Number(cents(totalBudget.remaining)) / Number(cents(totalBudget.amount)) * 100) : 0
  const difference = summary.data && prior.data && !prior.isError ? changePercent(summary.data.expense, prior.data.expense) : null
  const comparison = !difference ? '' : difference === '0.0%' ? '与上月持平' : `比上月${difference.startsWith('-') ? '少支' : '多支'} ${difference.replace(/^[+-]/, '')}`
  const transactions = useInfiniteQuery({
    queryKey: ['transactions', generation, ledgerId, selectedMonth, categoryId || 'all'],
    queryFn: ({ pageParam, signal }) => getTransactions({ ledgerId, month: selectedMonth, categoryId, page: pageParam }, signal),
    initialPageParam: 1, getNextPageParam: nextTransactionPage, enabled,
  })
  const sections = useMemo(() => mergeTransactionPages(transactions.data?.pages || []).map(group => ({ title: group.date, data: group.items, expense: group.items.filter(item => item.type === 'EXPENSE').reduce((sum, item) => sum + cents(item.amount), 0n), income: group.items.filter(item => item.type === 'INCOME').reduce((sum, item) => sum + cents(item.amount), 0n) })), [transactions.data])
  useEffect(() => { setPicker(false); setFilter(null) }, [generation])
  useEffect(() => {
    if (categoryId && categories.isSuccess && !categories.data.some(item => item.id === categoryId)) setFilter(null)
  }, [categoryId, categories.isSuccess, categories.data])
  useFocusEffect(useCallback(() => {
    if (!signedIn) return
    void refresh()
    void queryClient.invalidateQueries({ queryKey: ['transactions', generation] })
    void queryClient.invalidateQueries({ queryKey: ['summary', generation] })
    void queryClient.invalidateQueries({ queryKey: ['budgets', generation] })
  }, [signedIn, generation, refresh]))
  function refreshAll() {
    void refresh()
    if (enabled) { void categories.refetch(); void summary.refetch(); void prior.refetch(); void budgets.refetch(); void transactions.refetch() }
  }
  if (!signedIn) return <Screen title="明细"><LoginRequired /></Screen>
  const header = <>
    <ErrorNotice error={ledger.error} retry={() => void refresh()} busy={ledger.refreshing} />
    {ledger.loading ? <LoadingState label="正在读取账本" /> : !ledger.current && !ledger.error ? <View style={ui.section}><EmptyState icon={BookOpen} title="还没有账本" message="创建账本后开始记录。" login={false} /><ActionButton label="创建账本" icon={Plus} onPress={() => router.push('/ledgers')} /></View> : null}
    {ledger.current && <>
      <View style={styles.filters}>
        <View ref={anchor} collapsable={false} style={{ flex: 1, minWidth: 0 }}><Pressable accessibilityRole="button" accessibilityLabel={`选择账本，${ledger.current.name}`} onPress={() => anchor.current?.measureInWindow((left, top, _width, height) => { setMenuPosition({ left, top: top + height + 4 }); setPicker(true) })} style={({ pressed }) => [styles.ledgerTrigger, pressed && ui.pressed]}><View style={styles.dot} /><Text numberOfLines={1} style={styles.ledgerName}>{ledger.current.name}</Text><ChevronDown size={12} color={colors.muted} /></Pressable></View>
        <MonthPicker {...month} compact />
      </View>
      <View style={[ui.card, styles.balance]}>
        <View style={[ui.between, { flexWrap: 'wrap', gap: 8 }]}><Text style={styles.balanceLabel}>本月结余</Text>{!!comparison && <Text style={styles.badge}>{comparison}</Text>}</View>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[ui.amount, { paddingTop: 6, color: summary.data?.balance.startsWith('-') ? colors.expense : colors.ink }]}>¥{formatMoney(summary.data?.balance)}</Text>
        <View style={styles.totals}>
          <View style={styles.total}><Text style={styles.transactionDetail}>本月收入</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[styles.value, { color: colors.income }]}>+¥{formatMoney(summary.data?.income)}</Text></View>
          <View style={styles.divider} />
          <View style={[styles.total, { alignItems: 'flex-end' }]}><Text style={styles.transactionDetail}>本月支出</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[styles.value, { color: colors.expense }]}>-¥{formatMoney(summary.data?.expense)}</Text></View>
        </View>
      </View>
      <ErrorNotice error={summary.isError ? summary.error : null} retry={() => void summary.refetch()} busy={summary.isFetching} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {[{ id: '', name: '全部' }, ...(categories.data || [])].map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ checked: (categoryId || '') === item.id }} onPress={() => setFilter({ ledgerId, categoryId: item.id })} style={({ pressed }) => [styles.chip, (categoryId || '') === item.id && styles.activeChip, pressed && ui.pressed]}><Text numberOfLines={1} style={[styles.chipText, (categoryId || '') === item.id && styles.activeChipText]}>{item.name}</Text></Pressable>)}
      </ScrollView>
      <ErrorNotice error={categories.isError ? categories.error : null} retry={() => void categories.refetch()} busy={categories.isFetching} />
    </>}
  </>
  return (
    <Screen title="明细" scroll={false}>
      <SectionList sections={enabled ? sections : []} keyExtractor={item => item.id} stickySectionHeadersEnabled={false} contentContainerStyle={{ paddingBottom: 32 }} ListHeaderComponent={header}
        renderItem={({ item, index, section }) => <TransactionRow item={item} first={index === 0} last={index === section.data.length - 1} />} renderSectionHeader={({ section }) => <View style={styles.date}><Text accessibilityRole="header" style={styles.dateTitle}>{groupTitle(section.title)}</Text><View style={styles.dailyTotals}>{section.expense > 0n && <Text style={styles.dayTotal}>支 ¥{formatMoney(moneyFromCents(section.expense))}</Text>}{section.income > 0n && <Text style={[styles.dayTotal, { color: colors.income }]}>收 ¥{formatMoney(moneyFromCents(section.income))}</Text>}</View></View>}
        renderSectionFooter={() => <View style={{ height: 16 }} />}
        refreshing={ledger.refreshing || (enabled && transactions.isRefetching && !transactions.isFetchingNextPage)} onRefresh={refreshAll}
        onEndReachedThreshold={0.3} onEndReached={() => { if (transactions.hasNextPage && !transactions.isFetching && !transactions.isError) void transactions.fetchNextPage() }}
        ListEmptyComponent={enabled ? transactions.isPending ? <LoadingState label="正在读取流水" /> : !transactions.isError ? <View><EmptyState icon={ReceiptText} title={categoryId ? '该分类暂无记录' : '本月暂无记录'} message="" login={false} /><ActionButton label="记一笔" icon={Plus} onPress={() => router.push('/record')} /></View> : null : null}
        ListFooterComponent={enabled ? <View style={{ gap: 12, paddingTop: 8 }}><ErrorNotice error={transactions.isError ? transactions.error : null} busy={transactions.isFetching} retry={() => { if (transactions.isFetchNextPageError) void transactions.fetchNextPage(); else void transactions.refetch() }} />{transactions.isFetchingNextPage ? <LoadingState label="正在加载更多" /> : transactions.hasNextPage && !transactions.isError ? <Pressable accessibilityRole="button" onPress={() => void transactions.fetchNextPage()} style={styles.more}><Text style={ui.muted}>上拉加载更多</Text></Pressable> : sections.length > 0 && !transactions.isError ? <Text style={[ui.muted, { textAlign: 'center' }]}>没有更多了</Text> : null}
          <ErrorNotice error={budgets.isError ? budgets.error : null} retry={() => void budgets.refetch()} busy={budgets.isFetching} />
          {totalBudget && <View style={styles.budget}><View style={styles.budgetIcon}><PiggyBank size={18} color={colors.warm} /></View><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={styles.transactionDetail}>{month.month.getMonth() + 1}月预算余</Text><Text adjustsFontSizeToFit numberOfLines={1} style={styles.budgetAmount}>¥{formatMoney(totalBudget.remaining)}</Text></View><View style={{ gap: 6, alignItems: 'flex-end' }}><Text style={styles.badge}>{availablePercent < 0 ? '已超支' : `可用 ${availablePercent}%`}</Text><View style={styles.progress}><View style={[styles.progressValue, { width: `${Math.max(0, Math.min(100, availablePercent))}%` }]} /></View></View></View>}
        </View> : null} />
      <Modal visible={picker} transparent animationType="fade" onRequestClose={() => setPicker(false)}><View style={{ flex: 1 }}><Pressable accessibilityRole="button" accessibilityLabel="关闭账本菜单" style={StyleSheet.absoluteFill} onPress={() => setPicker(false)} /><View accessibilityViewIsModal role="dialog" accessibilityLabel="选择账本" style={[styles.ledgerMenu, { left: Math.max(8, Math.min(menuPosition.left, viewport.width - 232)), top: Math.min(menuPosition.top, Math.max(8, viewport.height - 240)), maxHeight: Math.min(320, viewport.height - 32) }]}><ScrollView>{ledger.ledgers.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: item.id === ledgerId }} onPress={() => { ledger.select(item.id); setPicker(false) }} style={({ pressed }) => [styles.ledgerOption, item.id === ledgerId && { backgroundColor: colors.container }, pressed && ui.pressed]}><Text style={[ui.body, { flex: 1 }]}>{item.name}</Text>{item.id === ledgerId && <Check size={16} color={colors.brand} />}</Pressable>)}</ScrollView></View></View></Modal>
    </Screen>
  )
}

const useStyles = themedStyles(colors => StyleSheet.create({
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 12 },
  ledgerTrigger: { minHeight: 44, flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, paddingHorizontal: 12, maxWidth: '100%', backgroundColor: colors.surface, borderRadius: 22 },
  ledgerName: { flexShrink: 1, fontSize: 13, color: colors.secondary },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  ledgerMenu: { position: 'absolute', width: 224, backgroundColor: colors.surface, borderRadius: 16, padding: 4, elevation: 8, shadowColor: '#141B2B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
  ledgerOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  balance: { padding: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(245,158,11,0.2)', marginBottom: 16 },
  balanceLabel: { fontSize: 12, fontWeight: '700', color: colors.secondary },
  badge: { paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, color: colors.warm, backgroundColor: colors.warmSoft, borderRadius: 12, overflow: 'hidden' },
  totals: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 20, marginTop: 16, marginHorizontal: -20, marginBottom: -20, alignItems: 'center', backgroundColor: colors.subtle, gap: 12 },
  total: { flex: 1, minWidth: 0, gap: 4 },
  value: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'], maxWidth: '100%' },
  divider: { height: 28, width: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  chips: { gap: 8, paddingBottom: 16 },
  chip: { minHeight: 44, maxWidth: 160, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.surface },
  activeChip: { backgroundColor: colors.brandSoft },
  chipText: { fontSize: 13, color: colors.secondary },
  activeChipText: { color: colors.brand, fontWeight: '700' },
  transaction: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 76, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  firstRow: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  lastRow: { borderBottomLeftRadius: 24, borderBottomRightRadius: 24, borderBottomWidth: 0 },
  transactionTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  transactionDetail: { fontSize: 12, lineHeight: 18, color: colors.secondary },
  transactionAmount: { maxWidth: '45%', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  date: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6, paddingBottom: 8 },
  dateTitle: { fontSize: 13, fontWeight: '600', color: colors.secondary },
  dailyTotals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayTotal: { fontSize: 11, color: colors.secondary },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  budget: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 24, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(245,158,11,0.3)' },
  budgetIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warmSoft },
  budgetAmount: { fontSize: 13, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  progress: { width: 64, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.warmSoft },
  progressValue: { height: 6, borderRadius: 3, backgroundColor: '#F59E0B' },
}))
