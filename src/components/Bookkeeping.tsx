import { useEffect, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Banknote, BookOpen, Bus, CalendarDays, Car, Check, ChevronDown, ChevronLeft, ChevronRight, Coffee, Dumbbell, Gamepad2, Gift, GraduationCap, House, PawPrint, Phone, Pill, Plane, RefreshCw, Repeat2, ShoppingBag, Tag, Trash2, TrendingUp, Utensils, X } from 'lucide-react-native'
import type { Category } from '../api/categories'
import { ApiError } from '../lib/http'
import { queryClient } from '../lib/query-client'
import { getSessionGeneration } from '../lib/token-storage'
import { monthKey, todayKey, validDate } from '../lib/bookkeeping'
import { useLedger } from '../providers/LedgerProvider'
import { useTheme, themedStyles } from '../theme'
import { ActionButton, EmptyState, IconButton } from './Screen'

export function useBookkeepingAction() {
  const { generation } = useLedger()
  const pending = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => () => pending.current?.abort(), [generation])
  async function run<T>(operation: (signal: AbortSignal) => Promise<T>, success?: (value: T) => void) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    const current = () => !controller.signal.aborted && generation === getSessionGeneration()
    try {
      const result = await operation(controller.signal)
      if (!current()) return
      const refresh = queryClient.invalidateQueries({ predicate: query => ['ledgers', 'categories', 'transactions', 'transaction', 'summary', 'stats', 'budgets'].includes(String(query.queryKey[0])) })
      success?.(result)
      await refresh
    } catch (cause) {
      if (current()) setError(cause instanceof ApiError && cause.status === 0
        ? `${cause.message}；操作结果尚未确认，请先刷新查看，避免重复提交。`
        : cause instanceof Error ? cause.message : '操作未完成，请稍后重试')
    } finally {
      if (current()) setBusy(false)
      if (pending.current === controller) pending.current = null
    }
  }
  return { busy, error, run, setError }
}

export function ErrorNotice({ error, retry, busy = false }: { error: unknown, retry?: () => void, busy?: boolean }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  if (!error) return null
  return <View style={{ gap: 10, paddingVertical: 12 }}><Text accessibilityRole="alert" style={{ color: colors.expense, fontSize: 14, lineHeight: 22 }}>{error instanceof Error ? error.message : String(error)}</Text>{retry && <ActionButton label="重试" icon={RefreshCw} secondary disabled={busy} onPress={retry} />}</View>
}

export function LoadingState({ label = '正在加载' }: { label?: string }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  return <View style={{ paddingVertical: 32, alignItems: 'center', gap: 12 }}><ActivityIndicator color={colors.brand} /><Text accessibilityLiveRegion="polite" style={ui.muted}>{label}</Text></View>
}

export function LoginRequired() {
  return <EmptyState icon={BookOpen} title="登录你的账本" message="登录后查看和管理收支。" />
}

export function Sheet({ visible, title, onClose, busy = false, compact = false, children }: PropsWithChildren<{ visible: boolean, title: string, onClose: () => void, busy?: boolean, compact?: boolean }>) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose() }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.backdrop, compact && { paddingHorizontal: 0 }]}><Pressable accessibilityLabel="关闭弹窗" disabled={busy} onPress={onClose} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={['top', 'bottom']} style={styles.sheetSafe} pointerEvents="box-none">
          <View role="dialog" accessibilityLabel={title} accessibilityViewIsModal style={styles.sheet}>
            <View style={[ui.between, { paddingLeft: 20, paddingRight: 8, paddingTop: 8 }]}><Text accessibilityRole="header" style={[ui.sectionTitle, { flex: 1 }]}>{title}</Text><IconButton label="关闭" icon={X} disabled={busy} onPress={onClose} /></View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: compact ? 4 : 20, gap: 16 }}>{children}</ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </KeyboardAvoidingView>
  </Modal>
}

export function ConfirmDelete({ visible, title, message, busy, error, onClose, onConfirm, label = '确认删除' }: { visible: boolean, title: string, message: string, busy: boolean, error: string, onClose: () => void, onConfirm: () => void, label?: string }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  return <Sheet visible={visible} title={title} busy={busy} onClose={onClose}><Text style={ui.body}>{message}</Text><ErrorNotice error={error} /><ActionButton label={busy ? '正在处理' : label} icon={Trash2} disabled={busy} onPress={onConfirm} /><ActionButton label="取消" secondary disabled={busy} onPress={onClose} /></Sheet>
}

export type Choice = { value: string, label: string, description?: string, category?: Category }

export function ChoiceSheet({ visible, title, options, value, onChange, onClose }: { visible: boolean, title: string, options: Choice[], value: string, onChange: (value: string) => void, onClose: () => void }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  const [search, setSearch] = useState('')
  useEffect(() => { if (!visible) setSearch('') }, [visible])
  const filtered = options.filter(option => option.label.includes(search.trim()))
  return <Sheet visible={visible} title={title} onClose={onClose}>
    {options.length > 8 && <TextInput accessibilityLabel="搜索选项" placeholder="搜索" placeholderTextColor={colors.muted} style={ui.input} value={search} onChangeText={setSearch} />}
    {filtered.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: option.value === value }} onPress={() => { onChange(option.value); onClose() }} style={({ pressed }) => [styles.choice, pressed && ui.pressed]}>
      {option.category && <CategorySymbol category={option.category} />}
      <View style={{ flex: 1, gap: 4 }}><Text style={ui.body}>{option.label}</Text>{option.description && <Text style={ui.muted}>{option.description}</Text>}</View>
      {option.value === value && <Check size={20} color={colors.brand} />}
    </Pressable>)}
    {!filtered.length && <Text style={ui.muted}>没有匹配的选项</Text>}
  </Sheet>
}

export function SelectionField({ label, value, onPress, disabled = false, hideLabel = false, compact = false }: { label: string, value: string, onPress: () => void, disabled?: boolean, hideLabel?: boolean, compact?: boolean }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  return <View style={{ gap: 8, minWidth: 0 }}>{!hideLabel && <Text style={ui.body}>{label}</Text>}<Pressable accessibilityRole="button" accessibilityLabel={`${label}：${value}`} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.input, ui.between, compact && { minHeight: 44, borderRadius: 22, borderWidth: 0, paddingVertical: 8, paddingHorizontal: 12 }, disabled && { opacity: 0.6 }, pressed && ui.pressed]}><Text numberOfLines={compact ? 1 : undefined} style={[ui.body, { flex: 1 }]}>{value}</Text><ChevronDown size={compact ? 14 : 18} color={colors.muted} /></Pressable></View>
}

const categoryIcons = [
  { code: 'restaurant', names: /餐饮|美食|吃饭|外卖|零食/, icon: Utensils },
  { code: 'cafe', names: /咖啡|奶茶|饮品/, icon: Coffee },
  { code: 'bus', names: /交通|出行|打车|公交|地铁/, icon: Bus },
  { code: 'car', names: /加油|汽车|停车/, icon: Car },
  { code: 'shopping-bag', names: /购物|日用|超市|生鲜|服饰|穿搭/, icon: ShoppingBag },
  { code: 'home', names: /居住|住房|房租|物业|水电/, icon: House },
  { code: 'game-console', names: /娱乐|休闲|游戏|电影/, icon: Gamepad2 },
  { code: 'medication', names: /医疗|健康|药品|看病/, icon: Pill },
  { code: 'education', names: /学习|教育|书籍|培训/, icon: GraduationCap },
  { code: 'phone', names: /通讯|话费|网费/, icon: Phone },
  { code: 'gift', names: /人情|礼物|红包|礼金/, icon: Gift },
  { code: 'plane', names: /旅行|旅游|机票|酒店/, icon: Plane },
  { code: 'soccer', names: /运动|健身/, icon: Dumbbell },
  { code: 'dog-walker', names: /宠物/, icon: PawPrint },
  { code: 'money', names: /工资|收入|奖金|兼职/, icon: Banknote },
  { code: 'growth', names: /理财|投资|基金/, icon: TrendingUp },
  { code: 'repeat', names: /转账|提现/, icon: Repeat2 },
]

export function CategorySymbol({ category, accent }: { category?: Pick<Category, 'name' | 'icon' | 'type'> | null, accent?: string }) {
  const { colors, dark } = useTheme()
  const styles = useStyles()
  const match = categoryIcons.find(item => category?.icon === `i-carbon-${item.code}`) || categoryIcons.find(item => item.names.test(category?.name || ''))
  const Icon = match?.icon || Tag
  const palette = dark ? ['#A5B4FC', '#FCD34D', '#C084FC', '#34D399', '#F472B6', '#38BDF8'] : ['#4648D4', '#B45309', '#9333EA', '#047857', '#BE185D', '#0369A1']
  let index = 0
  for (let i = 0; i < (category?.name.length || 0); i++) index = (index + category!.name.charCodeAt(i)) % palette.length
  const color = accent || (category?.name ? palette[index] : colors.brand)
  return <View style={[styles.symbol, { backgroundColor: `${color}20` }]}><Icon size={22} color={color} /></View>
}

export function DateField({ value, onChange, disabled = false, compact = false, label = '日期' }: { value: string, onChange: (value: string) => void, disabled?: boolean, compact?: boolean, label?: string }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => new Date())
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const offset = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
  function move(direction: number) {
    setMonth(current => new Date(current.getFullYear(), current.getMonth() + direction, 1))
  }
  function show() { const date = validDate(value) ? value : todayKey(); const [y, m] = date.split('-').map(Number); setMonth(new Date(y, m - 1, 1)); setOpen(true) }
  return <View style={{ gap: 8 }}>{compact ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}：${value}`} disabled={disabled} onPress={show} style={({ pressed }) => [{ minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: colors.subtle, flexDirection: 'row', alignItems: 'center', gap: 6 }, pressed && ui.pressed]}><CalendarDays size={16} color={colors.brand} /><Text style={ui.body}>{value}</Text></Pressable> : <><Text style={ui.body}>{label}</Text><View style={ui.row}>
    <TextInput accessibilityLabel="日期，YYYY-MM-DD" placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} value={value} onChangeText={onChange} maxLength={10} editable={!disabled} keyboardType="numbers-and-punctuation" style={[ui.input, { flex: 1 }]} />
    <IconButton label={`选择${label}`} icon={CalendarDays} disabled={disabled} onPress={show} />
  </View></>}<Sheet visible={open} title={`选择${label}`} compact onClose={() => setOpen(false)}>
    <View style={ui.between}><IconButton label="上个月" icon={ChevronLeft} disabled={month.getFullYear() === 1900 && month.getMonth() === 0} onPress={() => move(-1)} /><Text style={ui.sectionTitle}>{month.getFullYear()}年{month.getMonth() + 1}月</Text><IconButton label="下个月" icon={ChevronRight} disabled={month.getFullYear() === 9999 && month.getMonth() === 11} onPress={() => move(1)} /></View>
    <View style={styles.calendar}>{['日', '一', '二', '三', '四', '五', '六'].map(day => <View key={day} style={styles.day}><Text style={ui.muted}>{day}</Text></View>)}
      {Array.from({ length: offset + count }, (_, index) => {
        const day = index - offset + 1
        const date = `${monthKey(month)}-${String(day).padStart(2, '0')}`
        return day < 1 ? <View key={index} style={styles.day} /> : <Pressable key={index} accessibilityRole="button" accessibilityLabel={date} accessibilityState={{ selected: value === date }} style={({ pressed }) => [styles.day, value === date && { backgroundColor: colors.brandSoft }, pressed && ui.pressed]} onPress={() => { onChange(date); setOpen(false) }}><Text style={[ui.body, value === date && { color: colors.brand, fontWeight: '700' }]}>{day}</Text></Pressable>
      })}
    </View><ActionButton label="今天" secondary icon={CalendarDays} onPress={() => { onChange(todayKey()); setOpen(false) }} />
  </Sheet></View>
}

const useStyles = themedStyles(colors => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.35)', justifyContent: 'flex-end', alignItems: 'center' },
  sheetSafe: { width: '100%', maxWidth: 560, maxHeight: '94%' },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, flexShrink: 1, overflow: 'hidden' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 12, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  symbol: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.285714%', minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
}))
