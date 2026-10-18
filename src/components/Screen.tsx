import { useState } from 'react'
import type { PropsWithChildren, ReactNode } from 'react'
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, LogIn, X } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme, themedStyles } from '../theme'

export function Screen({ children, title, subtitle, back = false, action, scroll = true, refreshing = false, onRefresh }: PropsWithChildren<{ title: string, subtitle?: string, back?: boolean, action?: ReactNode, scroll?: boolean, refreshing?: boolean, onRefresh?: () => void }>) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  const tabPage = !back && ['明细', '图表', '预算', '我的'].includes(title)
  return (
    <SafeAreaView edges={back ? ['top', 'bottom', 'left', 'right'] : ['top', 'left', 'right']} style={styles.safe}>
      <View style={[styles.header, tabPage && styles.tabHeader]}>
        <View style={[ui.row, { flex: 1 }]}>
          {back && <IconButton label="返回" icon={ArrowLeft} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />}
          {tabPage && <Image source={require('../../assets/icon.png')} style={styles.logo} accessibilityLabel="柴记账" />}
          <View style={{ flex: 1, gap: 4 }}>
            {subtitle && !tabPage && <Text style={ui.muted}>{subtitle}</Text>}
            <Text accessibilityRole="header" style={ui.title}>{title}</Text>
          </View>
        </View>
        {action}
      </View>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} /> : undefined} contentContainerStyle={styles.content}>
        <View style={styles.inner}>{children}</View>
      </ScrollView> : <View style={[styles.content, { flex: 1, paddingBottom: 0 }]}><View style={styles.inner}>{children}</View></View>}
    </SafeAreaView>
  )
}

export function IconButton({ label, icon: Icon, onPress, disabled = false }: { label: string, icon: LucideIcon, onPress: () => void, disabled?: boolean }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} aria-disabled={disabled} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.iconButton, disabled && { opacity: 0.3 }, pressed && ui.pressed]}><Icon size={22} color={colors.secondary} /></Pressable>
}

export function PanelScreen({ title, children, scroll = true }: PropsWithChildren<{ title: string, scroll?: boolean }>) {
  const { colors, ui } = useTheme()
  const viewport = useWindowDimensions()
  const landscape = viewport.width >= 600 && viewport.width > viewport.height
  const close = () => router.canGoBack() ? router.back() : router.replace('/')
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{ flex: 1, backgroundColor: 'rgba(17,24,39,0.35)', justifyContent: 'flex-end', alignItems: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="关闭面板" onPress={close} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={{ width: '100%', maxWidth: !scroll && landscape ? 900 : 560, maxHeight: '92%', height: scroll ? undefined : '92%', backgroundColor: colors.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
        <View style={[ui.between, { paddingLeft: 20, paddingRight: 8, paddingTop: 8 }]}><Text style={ui.sectionTitle}>{title}</Text><IconButton label="关闭" icon={X} onPress={close} /></View>
        {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>{children}</ScrollView> : <View style={{ flex: 1, minHeight: 0 }}>{children}</View>}
      </SafeAreaView>
    </View>
  </KeyboardAvoidingView>
}

export function ActionButton({ label, onPress, secondary = false, disabled = false, icon: Icon = ArrowRight }: { label: string, onPress: () => void, secondary?: boolean, disabled?: boolean, icon?: LucideIcon }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} aria-disabled={disabled} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondaryButton, disabled && styles.disabledButton, pressed && ui.pressed]}>
      <Icon size={20} color={secondary || disabled ? colors.brand : colors.onBrand} />
      <Text style={[styles.buttonLabel, (secondary || disabled) && { color: colors.brand }]}>{label}</Text>
    </Pressable>
  )
}

export function EmptyState({ icon: Icon, title, message, login = true }: { icon: LucideIcon, title: string, message: string, login?: boolean }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Icon size={32} strokeWidth={1.6} color={colors.brand} /></View>
      <Text style={[ui.sectionTitle, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[ui.body, { textAlign: 'center', maxWidth: 300 }]}>{message}</Text>
      {login && <ActionButton label="前往登录" icon={LogIn} onPress={() => router.push('/login')} />}
    </View>
  )
}

export function Segments({ options, value, onChange, disabled = false }: { options: string[], value: string, onChange: (value: string) => void, disabled?: boolean }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  return <View style={styles.segments}>{options.map(option => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: value === option, disabled }} aria-selected={value === option} disabled={disabled} onPress={() => onChange(option)} style={({ pressed }) => [styles.segment, value === option && styles.segmentActive, pressed && ui.pressed]}><Text style={[styles.segmentText, value === option && { color: colors.brand, fontWeight: '700' }]}>{option}</Text></Pressable>)}</View>
}

export function useMonth() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const label = `${month.getFullYear()}年${month.getMonth() + 1}月`
  function move(offset: number) { setMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + offset, 1)) }
  return { month, label, move, select: setMonth }
}

export function MonthPicker({ label, move, month, select, compact = false }: { label: string, move: (offset: number) => void, month?: Date, select?: (value: Date) => void, compact?: boolean }) {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => new Date().getFullYear())
  if (compact && month && select) return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`选择月份，${label}`} onPress={() => { setYear(month.getFullYear()); setOpen(true) }} style={({ pressed }) => [styles.monthTrigger, pressed && ui.pressed]}>
      <CalendarDays size={16} color={colors.brand} /><Text style={styles.monthLabel}>{label}</Text><ChevronDown size={12} color={colors.muted} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.monthBackdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="取消选择月份" style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.monthSafe} pointerEvents="box-none">
          <View accessibilityViewIsModal role="dialog" accessibilityLabel="选择月份" style={styles.monthSheet}>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <View style={ui.between}><IconButton label="上一年" icon={ChevronLeft} disabled={year <= 1900} onPress={() => setYear(value => value - 1)} /><Text style={ui.sectionTitle}>{year}年</Text><IconButton label="下一年" icon={ChevronRight} disabled={year >= 9999} onPress={() => setYear(value => value + 1)} /></View>
              <View style={styles.monthGrid}>{Array.from({ length: 12 }, (_, index) => {
                const selected = month.getFullYear() === year && month.getMonth() === index
                return <Pressable key={index} accessibilityRole="radio" accessibilityLabel={`${year}年${index + 1}月`} accessibilityState={{ checked: selected }} onPress={() => { select(new Date(year, index, 1)); setOpen(false) }} style={({ pressed }) => [styles.monthOption, selected && { backgroundColor: colors.brandSoft }, pressed && ui.pressed]}><Text style={[ui.body, selected && { color: colors.brand, fontWeight: '700' }]}>{index + 1}月</Text></Pressable>
              })}</View>
              <ActionButton label="取消" secondary onPress={() => setOpen(false)} />
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  </>
  return <View style={ui.between}><Text style={[ui.sectionTitle, { flex: 1 }]}>{label}</Text><View style={ui.row}><IconButton label="上个月" icon={ChevronLeft} onPress={() => move(-1)} /><IconButton label="下个月" icon={ChevronRight} onPress={() => move(1)} /></View></View>
}

const useStyles = themedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tabHeader: { minHeight: 44, paddingVertical: 8 },
  logo: { width: 28, height: 28, borderRadius: 14 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  inner: { width: '100%', maxWidth: 728, alignSelf: 'center', flex: 1 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  button: { minHeight: 48, borderRadius: 14, backgroundColor: colors.brandAction, paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  secondaryButton: { backgroundColor: colors.brandSoft },
  disabledButton: { backgroundColor: colors.brandSoft, opacity: 0.65 },
  buttonLabel: { color: colors.onBrand, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  empty: { paddingVertical: 28, alignItems: 'center', gap: 16 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  segments: { flexDirection: 'row', borderRadius: 14, backgroundColor: colors.subtle, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 15, color: colors.secondary, textAlign: 'center' },
  monthTrigger: { minHeight: 44, flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 10, backgroundColor: colors.surface, borderRadius: 22 },
  monthLabel: { fontSize: 13, color: colors.secondary },
  monthBackdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  monthSafe: { width: '100%', maxWidth: 560, maxHeight: '94%' },
  monthSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', flexShrink: 1 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthOption: { width: '25%', minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
}))
