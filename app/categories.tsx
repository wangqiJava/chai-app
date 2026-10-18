import { useCallback, useState } from 'react'
import { FlatList, Text, TextInput, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react-native'
import { createCategory, deleteCategory, getCategories, updateCategory } from '../src/api/categories'
import type { Category, TransactionType } from '../src/api/categories'
import { CategorySymbol, ConfirmDelete, ErrorNotice, LoadingState, LoginRequired, Sheet, useBookkeepingAction } from '../src/components/Bookkeeping'
import { ActionButton, EmptyState, IconButton, Screen, Segments } from '../src/components/Screen'
import { useLedger } from '../src/providers/LedgerProvider'
import { useTheme } from '../src/theme'

export default function CategoriesPage() {
  const { generation } = useLedger()
  return <CategoryManager key={generation} />
}

function CategoryManager() {
  const { colors, ui } = useTheme()
  const { signedIn, generation, ledgers } = useLedger()
  const [type, setType] = useState<TransactionType>('EXPENSE')
  const [editor, setEditor] = useState<{ item?: Category, type: TransactionType } | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const action = useBookkeepingAction()
  const categories = useQuery({ queryKey: ['categories', generation, 'all'], queryFn: ({ signal }) => getCategories(undefined, signal), enabled: signedIn })
  const { refetch } = categories
  useFocusEffect(useCallback(() => { if (signedIn) void refetch() }, [signedIn, refetch]))
  function edit(item?: Category) { action.setError(''); setName(item?.name || ''); setEditor({ item, type: item?.type || type }) }
  function save() {
    const value = name.trim()
    if (!editor || !value || value.length > 10) { action.setError('分类名称须为 1-10 个字符'); return }
    void action.run(signal => editor.item ? updateCategory(editor.item.id, value, signal) : createCategory({ name: value, type: editor.type }, signal), () => setEditor(null))
  }
  return <Screen title="分类管理" back scroll={false}>
    {!signedIn ? <LoginRequired /> : <FlatList data={(categories.data || []).filter(item => item.type === type)} keyExtractor={item => item.id} refreshing={categories.isFetching} onRefresh={() => void refetch()} contentContainerStyle={{ paddingBottom: 32 }}
      ListHeaderComponent={<View style={{ gap: 12, paddingBottom: 16 }}><Segments options={['支出', '收入']} value={type === 'EXPENSE' ? '支出' : '收入'} onChange={value => setType(value === '支出' ? 'EXPENSE' : 'INCOME')} /><ErrorNotice error={categories.isError ? categories.error : null} retry={() => void refetch()} busy={categories.isFetching} />{!editor && !deleting && <ErrorNotice error={action.error} />}</View>}
      ListEmptyComponent={categories.isPending ? <LoadingState /> : !categories.isError ? <EmptyState icon={Tags} title="暂无分类" message="添加一个常用分类。" login={false} /> : null}
      renderItem={({ item }) => <View style={[ui.card, ui.row, { padding: 12, gap: 8, marginBottom: 10, minHeight: 72 }]}>
        <CategorySymbol category={item} /><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={[ui.body, { fontWeight: '600', color: colors.ink }]}>{item.name}</Text>{!!item.userId && <Text style={ui.muted}>{item.ledgerId ? ledgers.find(ledger => ledger.id === item.ledgerId)?.name || '账本专用分类' : '自定义分类'}</Text>}</View>
        {!item.userId && <Text style={{ color: colors.muted, backgroundColor: colors.subtle, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, fontSize: 11 }}>系统</Text>}
        {!!item.userId && <><IconButton label={`编辑${item.name}`} icon={Pencil} disabled={action.busy} onPress={() => edit(item)} /><IconButton label={`停用${item.name}`} icon={Trash2} disabled={action.busy} onPress={() => { action.setError(''); setDeleting(item) }} /></>}
      </View>} />}
    {signedIn && <View style={{ paddingVertical: 12 }}><ActionButton label="新增分类" icon={Plus} disabled={action.busy} onPress={() => edit()} /></View>}
    <Sheet visible={!!editor} title={editor?.item ? '编辑分类' : `新增${editor?.type === 'INCOME' ? '收入' : '支出'}分类`} busy={action.busy} onClose={() => setEditor(null)}>
      <Text style={ui.body}>分类名称</Text><TextInput accessibilityLabel="分类名称" autoFocus value={name} onChangeText={setName} maxLength={10} editable={!action.busy} returnKeyType="done" onSubmitEditing={save} style={ui.input} /><ErrorNotice error={action.error} /><ActionButton label={action.busy ? '正在保存' : '保存分类'} disabled={action.busy} onPress={save} />
    </Sheet>
    <ConfirmDelete visible={!!deleting} title="停用分类" message={`停用“${deleting?.name || ''}”？已有流水仍保留原分类。`} busy={action.busy} error={action.error} label="确认停用" onClose={() => setDeleting(null)} onConfirm={() => { if (deleting) void action.run(signal => deleteCategory(deleting.id, signal), () => setDeleting(null)) }} />
  </Screen>
}
