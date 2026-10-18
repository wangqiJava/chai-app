import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Search } from 'lucide-react-native'
import { getCalendar, getCategoryRatio, getMonthlySummary, getRangeSummary, getTrend } from '../../src/api/stats'
import { CategorySymbol, ChoiceSheet, DateField, ErrorNotice, LoadingState, LoginRequired, SelectionField, Sheet } from '../../src/components/Bookkeeping'
import { CalendarChart, CategoryChart, MoneySummary, TrendChart } from '../../src/components/Charts'
import { ActionButton, EmptyState, MonthPicker, Screen, Segments, useMonth } from '../../src/components/Screen'
import { formatMoney, monthKey, todayKey } from '../../src/lib/bookkeeping'
import { averageDays, averageMoney, changePercent, previousMonth, validRange } from '../../src/lib/insights'
import { queryClient } from '../../src/lib/query-client'
import { useLedger } from '../../src/providers/LedgerProvider'
import { useTheme } from '../../src/theme'
import { getTransactions } from '../../src/api/transactions'
import type { Transaction } from '../../src/api/transactions'
import { cents, moneyFromCents } from '../../src/lib/insights'

export async function loadDayTransactions(ledgerId: string, month: string, date: string, signal: AbortSignal) {
  const items = new Map<string, Transaction>()
  let page = 1
  while (!signal.aborted) {
    const result = await getTransactions({ ledgerId, month, page }, signal)
    for (const group of result.list) {
      if (group.date.slice(0, 10) === date) for (const item of group.items) items.set(item.id, item)
    }
    // The API is ordered newest first; stop only once the selected day is complete.
    if (page >= result.pagination.totalPages || result.list.some(group => group.date.slice(0, 10) < date)) break
    page += 1
  }
  if (signal.aborted) throw new Error('查询已取消')
  return Array.from(items.values())
}

export default function StatsPage() {
  const { generation } = useLedger()
  return <StatsManager key={generation} />
}

function StatsManager() {
  const { colors, ui } = useTheme()
  const ledger = useLedger()
  const month = useMonth()
  const selectedMonth = monthKey(month.month)
  const [mode, setMode] = useState('月度')
  const [kind, setKind] = useState('支出')
  const [choosing, setChoosing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const refreshStats = useCallback(() => queryClient.invalidateQueries({ predicate: query => ['stats', 'summary'].includes(String(query.queryKey[0])) }), [])
  const { signedIn, refresh } = ledger
  useFocusEffect(useCallback(() => { if (signedIn) { void refresh(); void refreshStats() } }, [signedIn, refresh, refreshStats]))
  async function reload() {
    setRefreshing(true)
    try { await Promise.all([refresh(), refreshStats()]) } finally { setRefreshing(false) }
  }
  function move(offset: number) {
    const next = new Date(month.month.getFullYear(), month.month.getMonth() + offset, 1)
    if (next.getFullYear() >= 1900 && next.getFullYear() <= 9999) month.move(offset)
  }
  return <Screen title="图表" subtitle="收支一目了然" refreshing={refreshing} onRefresh={signedIn ? () => void reload() : undefined}>
    {!signedIn ? <LoginRequired /> : <>
      <ErrorNotice error={ledger.error} retry={() => void reload()} busy={refreshing} />
      {ledger.loading ? <LoadingState /> : ledger.current ? <>
        <View style={[ui.between, { gap: 8 }]}><View style={{ flex: 1, minWidth: 0 }}><SelectionField compact label="账本" value={ledger.current.name} hideLabel onPress={() => setChoosing(true)} /></View>{mode === '月度' && <MonthPicker compact month={month.month} select={month.select} label={month.label} move={move} />}</View>
        <View style={{ paddingTop: 16 }}><Segments options={['月度', '自定义区间']} value={mode} onChange={setMode} /></View>
        {mode === '月度' ? <>
          <MonthlyStats key={`${ledger.current.id}:${selectedMonth}`} ledgerId={ledger.current.id} month={selectedMonth} kind={kind} onKind={setKind} generation={ledger.generation} />
        </> : <RangeStats key={ledger.current.id} ledgerId={ledger.current.id} generation={ledger.generation} />}
      </> : !ledger.error && <><EmptyState icon={BookOpen} title="还没有账本" message="创建账本后查看统计。" login={false} /><ActionButton label="管理账本" icon={BookOpen} onPress={() => router.push('/ledgers')} /></>}
    </>}
    <ChoiceSheet visible={choosing} title="选择账本" options={ledger.ledgers.map(item => ({ value: item.id, label: item.name }))} value={ledger.current?.id || ''} onChange={ledger.select} onClose={() => setChoosing(false)} />
  </Screen>
}

function DataSection({ title, query, children, action }: { title: string, query: { isPending: boolean, isError: boolean, error: unknown, isFetching: boolean, refetch: () => unknown }, children: ReactNode, action?: ReactNode }) {
  const { colors, ui } = useTheme()
  return <View style={[ui.card, { padding: 20, marginTop: 16, gap: 12 }]}><View style={[ui.between, { flexWrap: 'wrap' }]}><Text accessibilityRole="header" style={ui.sectionTitle}>{title}</Text>{action}</View><ErrorNotice error={query.isError ? query.error : null} retry={() => { query.refetch() }} busy={query.isFetching} />{query.isPending ? <LoadingState /> : children}</View>
}

function MonthlyStats({ ledgerId, month, kind, onKind, generation }: { ledgerId: string, month: string, kind: string, onKind: (value: string) => void, generation: number }) {
  const { colors, ui } = useTheme()
  const [day, setDay] = useState<string | null>(null)
  const daily = useQuery({ queryKey: ['transactions', generation, ledgerId, month, 'day', day], queryFn: ({ signal }) => loadDayTransactions(ledgerId, month, day!, signal), enabled: !!day })
  const type = kind === '收入' ? 'INCOME' : 'EXPENSE'
  const summary = useQuery({ queryKey: ['summary', generation, ledgerId, month], queryFn: ({ signal }) => getMonthlySummary(ledgerId, month, signal) })
  const priorMonth = previousMonth(month)
  const previous = useQuery({ queryKey: ['summary', generation, ledgerId, priorMonth], queryFn: ({ signal }) => getMonthlySummary(ledgerId, priorMonth, signal), enabled: priorMonth >= '1900-01' })
  const category = useQuery({ queryKey: ['stats', generation, ledgerId, month, type], queryFn: ({ signal }) => getCategoryRatio(ledgerId, month, type, signal) })
  const trend = useQuery({ queryKey: ['stats', generation, ledgerId, 'trend', monthKey(new Date())], queryFn: ({ signal }) => getTrend(ledgerId, signal) })
  const calendar = useQuery({ queryKey: ['stats', generation, ledgerId, month, 'calendar'], queryFn: ({ signal }) => getCalendar(ledgerId, month, signal) })
  const total = summary.data?.[type === 'INCOME' ? 'income' : 'expense']
  const prior = previous.data?.[type === 'INCOME' ? 'income' : 'expense']
  const change = total !== undefined && prior !== undefined ? changePercent(total, prior) : null
  return <>
    <DataSection title={`${Number(month.slice(-2))}月总${kind}`} query={summary} action={<View style={{ width: 140 }}><Segments options={['支出', '收入']} value={kind} onChange={onKind} /></View>}>{summary.data && <>
      <Text style={[ui.amount, { fontSize: formatMoney(total).length > 18 ? 20 : 28, color: type === 'INCOME' ? colors.income : colors.ink }]}>¥{formatMoney(total)}</Text>
      <View style={{ backgroundColor: colors.subtle, padding: 12, borderRadius: 14, gap: 4 }}><Text style={ui.body}>日均 ¥{formatMoney(averageMoney(total!, averageDays(month)))}</Text>
      <Text style={ui.muted}>{previous.isError ? '环比暂不可用' : previous.isFetching && !previous.data ? '正在加载上月数据' : prior === undefined ? '暂无上月数据' : `比上月 ¥${formatMoney(moneyFromCents(cents(total!) - cents(prior)))}${change === null ? '（上月为零）' : `（${change}）`}`}</Text></View>
      {previous.isError && <ErrorNotice error={previous.error} retry={() => void previous.refetch()} busy={previous.isFetching} />}
    </>}</DataSection>
    <DataSection title={`${kind}分类占比`} query={category} action={category.data && <Text style={ui.muted}>共 {category.data.list.length} 类</Text>}>{category.data && <CategoryChart data={category.data} />}</DataSection>
    <DataSection title="近半年收支" query={trend}>{trend.data && <><Text style={ui.muted}>截至 {monthKey(new Date())}</Text><TrendChart data={trend.data} /></>}</DataSection>
    <DataSection title={`${Number(month.slice(-2))}月消费热力图`} query={calendar}>{calendar.data && <CalendarChart data={calendar.data} onDay={setDay} />}</DataSection>
    <Sheet visible={!!day} title={`${day || ''} 收支明细`} onClose={() => setDay(null)}>
      {daily.isPending ? <LoadingState /> : <><ErrorNotice error={daily.isError ? daily.error : null} retry={() => void daily.refetch()} busy={daily.isFetching} />{daily.data?.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`查看${item.remark || item.category?.name || '流水'}`} onPress={() => { setDay(null); router.push({ pathname: '/record', params: { id: item.id } }) }} style={({ pressed }) => [ui.row, { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }, pressed && ui.pressed]}><CategorySymbol category={item.category} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={2} style={ui.body}>{item.remark || item.category?.name || '未分类'}</Text><Text style={ui.muted}>{item.category?.name}</Text></View><Text numberOfLines={1} adjustsFontSizeToFit style={{ maxWidth: '50%', color: item.type === 'INCOME' ? colors.income : colors.expense, fontWeight: '700' }}>{item.type === 'INCOME' ? '+' : '-'}¥{formatMoney(item.amount)}</Text></Pressable>)}{daily.isSuccess && !daily.data.length && <Text style={ui.muted}>当天暂无收支记录</Text>}</>}
    </Sheet>
  </>
}

function RangeStats({ ledgerId, generation }: { ledgerId: string, generation: number }) {
  const { colors, ui } = useTheme()
  const [start, setStart] = useState(`${new Date().getFullYear()}-01-01`)
  const [end, setEnd] = useState(todayKey())
  const [range, setRange] = useState<{ start: string, end: string } | null>(null)
  const [error, setError] = useState('')
  const result = useQuery({ queryKey: ['stats', generation, ledgerId, 'range', range?.start, range?.end], queryFn: ({ signal }) => getRangeSummary(ledgerId, range!.start, range!.end, signal), enabled: !!range })
  function submit() {
    if (!validRange(start, end)) { setError('请输入有效日期，且开始日期不能晚于结束日期'); return }
    setError('')
    if (range?.start === start && range.end === end) void result.refetch()
    else setRange({ start, end })
  }
  return <>
    <View style={ui.section}>
      <View style={[ui.row, { flexWrap: 'wrap' }]}><View style={{ gap: 8 }}><Text style={ui.muted}>开始日期</Text><DateField compact label="开始日期" value={start} onChange={value => { setStart(value); setRange(null); setError('') }} /></View><View style={{ gap: 8 }}><Text style={ui.muted}>结束日期</Text><DateField compact label="结束日期" value={end} onChange={value => { setEnd(value); setRange(null); setError('') }} /></View></View>
      <ErrorNotice error={error} /><ActionButton label={result.isFetching ? '正在查询' : '查询收支'} icon={Search} disabled={result.isFetching} onPress={submit} />
    </View>
    {range && <DataSection title={`${range.start} 至 ${range.end}`} query={result}>{result.data && <MoneySummary {...result.data} />}</DataSection>}
  </>
}
