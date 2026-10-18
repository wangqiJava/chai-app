import { useState } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import type { CalendarStats, CategoryRatio, Trend } from '../api/stats'
import { formatMoney } from '../lib/bookkeeping'
import { chartParts } from '../lib/insights'
import { CategorySymbol } from './Bookkeeping'
import { useTheme, themedStyles } from '../theme'


export function MoneySummary({ income, expense, balance }: { income: string, expense: string, balance: string }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  return <View style={[ui.row, { gap: 8, alignItems: 'flex-start' }]}>{[
    { label: '收入', value: income, color: colors.income },
    { label: '支出', value: expense, color: colors.expense },
    { label: '结余', value: balance, color: colors.ink },
  ].map(item => <View key={item.label} style={{ flex: 1, minWidth: 0, gap: 8 }}><Text style={ui.muted}>{item.label}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[styles.money, { fontSize: 16, color: item.color }]}>¥{formatMoney(item.value)}</Text></View>)}</View>
}

export function CategoryChart({ data }: { data: CategoryRatio }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  const palette = [colors.brandAction, '#F59E0B', '#10B981', '#EC4899', '#06B6D4', '#8B5CF6']
  const parts = chartParts(data.list.map(item => item.amount))
  const circumference = 2 * Math.PI * 76
  if (!parts.some(part => part.fraction > 0)) return <Text style={ui.muted}>本月暂无{data.type === 'INCOME' ? '收入' : '支出'}记录</Text>
  return <View style={{ gap: 20 }}>
    <View style={{ alignItems: 'center' }}><Svg width={200} height={200} viewBox="0 0 200 200" accessible={false} aria-hidden>
      <Circle cx={100} cy={100} r={76} fill="none" stroke={colors.line} strokeWidth={24} />
      {parts.map((part, index) => part.fraction > 0 && <Circle key={data.list[index].categoryId} cx={100} cy={100} r={76} fill="none" stroke={palette[index % palette.length]} strokeWidth={24} strokeDasharray={`${part.fraction * circumference} ${circumference}`} strokeDashoffset={-part.start * circumference} rotation={-90} origin="100,100" />)}
    </Svg><View style={{ position: 'absolute', width: 120, height: 200, alignItems: 'center', justifyContent: 'center', gap: 4 }}><Text style={ui.muted}>最高单项</Text><Text numberOfLines={1} style={ui.sectionTitle}>{data.list[0]?.category?.name || '未分类'}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.brand, fontSize: 15, fontWeight: '700', maxWidth: '100%' }}>¥{formatMoney(data.list[0]?.amount)}</Text></View></View>
    {data.list.map((item, index) => <View key={item.categoryId} style={styles.categoryRow}>
      <CategorySymbol category={item.category} accent={palette[index % palette.length]} />
      <View style={{ flex: 1, gap: 4 }}><Text style={ui.body}>{index + 1}. {item.category?.name || '已停用分类'}</Text><Text style={ui.muted}>{item.ratio.toFixed(2)}%</Text></View>
      <Text style={[styles.money, { fontSize: 16, maxWidth: '60%' }]}>¥{formatMoney(item.amount)}</Text>
    </View>)}
  </View>
}

export function TrendChart({ data }: { data: Trend }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  const [details, setDetails] = useState(false)
  const max = Math.max(1, ...data.list.flatMap(item => [Number(item.income), Number(item.expense)]))
  return <View style={{ gap: 12 }}>
    <View style={[ui.row, { justifyContent: 'flex-end' }]}><Text style={{ color: colors.warm }}>收入</Text><Text style={{ color: colors.brand }}>支出</Text></View>
    <View style={{ flexDirection: 'row', height: 160, alignItems: 'flex-end' }}>
      {data.list.map(item => <View key={item.month} accessible accessibilityLabel={`${item.month}，收入${formatMoney(item.income)}，支出${formatMoney(item.expense)}`} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 112 }}>
          <View style={{ width: 10, height: Math.max(Number(item.income) > 0 ? 2 : 0, Number(item.income) / max * 112), borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: '#F59E0B' }} />
          <View style={{ width: 10, height: Math.max(Number(item.expense) > 0 ? 2 : 0, Number(item.expense) / max * 112), borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.brandAction }} />
        </View><Text style={ui.muted}>{Number(item.month.slice(-2))}月</Text>
      </View>)}
    </View>
    <View style={ui.between}><Text style={ui.muted}>金额明细</Text><Switch accessibilityLabel="趋势金额明细" value={details} onValueChange={setDetails} trackColor={{ true: colors.brandAction }} /></View>
    {details && <><View style={styles.tableRow}><Text style={[ui.muted, { width: 62 }]}>月份</Text><Text style={[ui.muted, styles.cell]}>收入</Text><Text style={[ui.muted, styles.cell]}>支出</Text></View>
    {data.list.map(item => <View key={item.month} style={styles.tableRow}><Text style={[ui.muted, { width: 62 }]}>{item.month}</Text><Text style={[ui.body, styles.cell, { color: colors.income }]}>{formatMoney(item.income)}</Text><Text style={[ui.body, styles.cell, { color: colors.expense }]}>{formatMoney(item.expense)}</Text></View>)}</>}
  </View>
}

export function CalendarChart({ data, onDay }: { data: CalendarStats, onDay: (date: string) => void }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  const [year, month] = data.month.split('-').map(Number)
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const maximum = Math.max(1, ...data.list.map(day => Number(day.expense)))
  const days = Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => {
    const date = `${data.month}-${String(index + 1).padStart(2, '0')}`
    return data.list.find(day => day.date === date) || { date, income: '0.00', expense: '0.00' }
  })
  return <View style={{ gap: 12 }}>
    <View style={[ui.row, { justifyContent: 'flex-end', gap: 5 }]}><Text style={ui.muted}>少</Text>{[colors.subtle, colors.brandSoft, colors.brandAction, '#F59E0B'].map(color => <View key={color} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />)}<Text style={ui.muted}>高</Text></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {['一', '二', '三', '四', '五', '六', '日'].map(day => <View key={day} style={styles.day}><Text style={ui.muted}>{day}</Text></View>)}
      {Array.from({ length: offset }, (_, index) => <View key={`blank-${index}`} style={styles.day} />)}
      {days.map(day => {
        const level = Number(day.expense) / maximum
        const active = level > 0.3
        const fill = level > 0.8 ? '#F59E0B' : active ? colors.brandAction : level > 0 ? colors.brandSoft : colors.subtle
        return <Pressable key={day.date} accessibilityRole="button" accessibilityLabel={`${day.date}，收入${formatMoney(day.income)}，支出${formatMoney(day.expense)}，查看流水`} onPress={() => onDay(day.date)} style={({ pressed }) => [styles.day, { padding: 3 }, pressed && ui.pressed]}>
          <View style={{ width: '100%', aspectRatio: 1, minHeight: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: fill }}><Text style={{ fontSize: 12, color: level > 0.8 ? '#141B2B' : active ? colors.onBrand : colors.secondary }}>{Number(day.date.slice(-2))}</Text></View>
        </Pressable>
      })}
    </View>
  </View>
}

const useStyles = themedStyles(colors => StyleSheet.create({
  money: { fontSize: 20, fontWeight: '600', color: colors.ink, fontVariant: ['tabular-nums'], flexShrink: 1 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  tableRow: { flexDirection: 'row', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  cell: { flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  day: { width: '14.285714%', minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  daily: { gap: 12, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
}))
