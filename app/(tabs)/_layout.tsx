import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Tabs, router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChartNoAxesCombined, CircleUserRound, ReceiptText, Plus, Wallet } from 'lucide-react-native'
import { useTheme, themedStyles } from '../../src/theme'

const tabs = [
  { name: 'index', label: '明细', icon: ReceiptText },
  { name: 'stats', label: '图表', icon: ChartNoAxesCombined },
  { name: 'budget', label: '预算', icon: Wallet },
  { name: 'mine', label: '我的', icon: CircleUserRound },
]

export default function TabLayout() {
  const { colors, ui } = useTheme()
  const styles = useStyles()
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.canvas } }} tabBar={({ state, navigation }) => (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.bar}>
        <View style={styles.inner}>
          {tabs.flatMap((tab, index) => {
            const selected = state.routes[state.index]?.name === tab.name
            const Icon = tab.icon
            const button = <Pressable key={tab.name} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected }} aria-selected={selected} onPress={() => {
              const route = state.routes.find(item => item.name === tab.name)
              if (!route) return
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
              if (!selected && !event.defaultPrevented) navigation.navigate(tab.name)
            }} style={({ pressed }) => [styles.tab, pressed && ui.pressed]}><Icon size={23} color={selected ? colors.brand : colors.muted} strokeWidth={selected ? 2.2 : 1.8} /><Text style={[styles.label, selected && styles.selected]}>{tab.label}</Text></Pressable>
            return index === 2 ? [<Pressable key="record" accessibilityRole="button" accessibilityLabel="记一笔" onPress={() => router.push('/record')} style={({ pressed }) => [styles.tab, styles.record, pressed && ui.pressed]}><View style={styles.add}><Plus size={28} strokeWidth={2} color={colors.onBrand} /></View><Text style={styles.label}>记一笔</Text></Pressable>, button] : [button]
          })}
        </View>
      </SafeAreaView>
    )}>
      {tabs.map(tab => <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />)}
    </Tabs>
  )
}

const useStyles = themedStyles(colors => StyleSheet.create({
  bar: { backgroundColor: colors.canvas, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  inner: { flexDirection: 'row', width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 8, alignItems: 'center' },
  tab: { flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 2 },
  label: { fontSize: 11, color: colors.secondary, textAlign: 'center' },
  selected: { color: colors.brand, fontWeight: '600' },
  record: { justifyContent: 'flex-end', overflow: 'visible' },
  add: { backgroundColor: colors.brandAction, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowColor: colors.brandAction, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
}))
