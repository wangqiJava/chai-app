import { StyleSheet } from 'react-native'
import { createContext, useContext, useMemo } from 'react'

export const colors = {
  canvas: '#F9F9FF',
  surface: '#FFFFFF',
  ink: '#141B2B',
  secondary: '#464554',
  muted: '#686879',
  line: '#E5E7EB',
  brand: '#4648D4',
  brandSoft: '#E1E0FF',
  brandAction: '#6063EE',
  subtle: '#F1F3FF',
  container: '#E9EDFF',
  warm: '#B45309',
  warmSoft: '#FEF3C7',
  income: '#006C49',
  incomeSoft: '#E6F4EC',
  expense: '#B61722',
  expenseSoft: '#FCECEE',
  onBrand: '#FFFFFF',
}

export const darkColors: typeof colors = {
  canvas: '#0F172A', surface: '#1E293B', ink: '#F9FAFB', secondary: '#CBD5E1', muted: '#9CA3AF', line: '#334155',
  brand: '#A5B4FC', brandSoft: '#303A62', brandAction: '#6366F1', subtle: '#172033', container: '#303A62',
  warm: '#FCD34D', warmSoft: '#423B29', income: '#34D399', incomeSoft: '#163D37', expense: '#F87171', expenseSoft: '#452C3B', onBrand: '#FFFFFF',
}

export const createUI = (colors: typeof darkColors) => StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, letterSpacing: 0 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  body: { fontSize: 14, lineHeight: 21, color: colors.secondary },
  muted: { fontSize: 13, lineHeight: 20, color: colors.muted },
  amount: { fontSize: 36, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  section: { paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: 16 },
  card: { backgroundColor: colors.surface, borderRadius: 24, overflow: 'hidden' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: colors.ink },
  pressed: { opacity: 0.65 },
})

export const ui = createUI(colors)
export const ThemeContext = createContext({ colors, ui, dark: false, ready: false, setDark: (_value: boolean) => {}, error: '' })
export const useTheme = () => useContext(ThemeContext)
export function themedStyles<T>(factory: (palette: typeof colors) => T) {
  return function useStyles() {
    const { colors } = useTheme()
    return useMemo(() => factory(colors), [colors])
  }
}
