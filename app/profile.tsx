import { useEffect, useRef, useState } from 'react'
import { Image, Text, TextInput, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { launchImageLibraryAsync } from 'expo-image-picker'
import { CircleUserRound, ImagePlus, Pencil, Save, Upload, X } from 'lucide-react-native'
import { getProfile, updateProfile, uploadAvatar } from '../src/api/auth'
import type { UserProfile } from '../src/api/auth'
import { ErrorNotice, LoadingState, LoginRequired, Sheet } from '../src/components/Bookkeeping'
import { ActionButton, PanelScreen } from '../src/components/Screen'
import { useUnsavedChanges } from '../src/hooks/useUnsavedChanges'
import { avatarFormData, prepareAvatar } from '../src/lib/avatar'
import type { PreparedAvatar } from '../src/lib/avatar'
import { ApiError } from '../src/lib/http'
import { queryClient } from '../src/lib/query-client'
import { getSessionGeneration } from '../src/lib/token-storage'
import { useLedger } from '../src/providers/LedgerProvider'
import { useTheme } from '../src/theme'

export default function ProfilePage() {
  const { generation } = useLedger()
  return <ProfileContent key={generation} />
}

function ProfileContent() {
  const { signedIn, generation } = useLedger()
  const profile = useQuery({ queryKey: ['user-profile', generation], queryFn: ({ signal }) => getProfile(signal), enabled: signedIn, retry: false })
  return <PanelScreen title="编辑个人资料">
    {!signedIn ? <LoginRequired /> : <><ErrorNotice error={profile.isError ? profile.error : null} retry={() => void profile.refetch()} busy={profile.isFetching} />{profile.isPending ? <LoadingState /> : profile.data && <ProfileForm key={profile.data.id} initial={profile.data} generation={generation} />}</>}
  </PanelScreen>
}

function ProfileForm({ initial, generation }: { initial: UserProfile, generation: number }) {
  const { colors, ui } = useTheme()
  const [saved, setSaved] = useState(initial)
  const [nickname, setNickname] = useState(initial.nickname || '')
  const [candidate, setCandidate] = useState<PreparedAvatar | null>(null)
  const [busy, setBusy] = useState<'select' | 'upload' | 'nickname' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  const dirty = nickname !== (saved.nickname || '') || !!candidate
  const guard = useUnsavedChanges(dirty, !!busy)
  const avatar = candidate?.uri || saved.avatarUrl
  const showAvatar = avatar && avatar !== failedAvatar && (!!candidate || /^https:\/\//.test(avatar))
  const current = (controller: AbortController) => !controller.signal.aborted && getSessionGeneration() === generation
  function start(kind: 'select' | 'upload' | 'nickname') {
    if (pending.current || getSessionGeneration() !== generation) return null
    const controller = new AbortController()
    pending.current = controller
    setBusy(kind); setError(''); setNotice('')
    return controller
  }
  function finish(controller: AbortController) {
    if (pending.current === controller) pending.current = null
    if (current(controller)) setBusy(null)
  }
  function failed(controller: AbortController, cause: unknown) {
    if (!current(controller)) return
    setError(cause instanceof ApiError && cause.status === 0 ? `${cause.message}；结果尚未确认，可返回后重新打开资料核对。` : cause instanceof Error ? cause.message : '操作失败，请重试')
  }
  function accept(updated: UserProfile, controller: AbortController) {
    if (!current(controller)) return false
    if (updated.id !== initial.id) throw new Error('资料所属账号发生变化，请重新登录')
    setSaved(updated)
    queryClient.setQueryData(['user-profile', generation], updated)
    return true
  }
  async function choose() {
    const controller = start('select')
    if (!controller) return
    try {
      const picked = await launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, allowsMultipleSelection: false, quality: 1, exif: false })
      if (picked.canceled || !current(controller)) return
      const prepared = await prepareAvatar(picked.assets[0], controller.signal)
      if (current(controller)) { setCandidate(prepared); setFailedAvatar(null) }
    } catch (cause) { failed(controller, cause) } finally { finish(controller) }
  }
  async function saveAvatar() {
    if (!candidate) return
    const controller = start('upload')
    if (!controller) return
    try {
      const updated = await uploadAvatar(avatarFormData(candidate), controller.signal)
      if (!updated.avatarUrl || !/^https:\/\//.test(updated.avatarUrl)) throw new Error('头像返回地址异常，请重新打开资料核对')
      if (accept(updated, controller)) { setCandidate(null); setFailedAvatar(null); setNotice('头像已更新') }
    } catch (cause) { failed(controller, cause) } finally { finish(controller) }
  }
  async function saveNickname() {
    const value = nickname.trim()
    if (!value || value.length > 32) { setError('昵称须为 1-32 个字符'); return }
    const controller = start('nickname')
    if (!controller) return
    try {
      const updated = await updateProfile(value, controller.signal)
      if (accept(updated, controller)) { setNickname(updated.nickname || ''); setNotice('昵称已保存') }
    } catch (cause) { failed(controller, cause) } finally { finish(controller) }
  }
  return <>
    <View style={[ui.section, { alignItems: 'center' }]}>
      <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>{showAvatar ? <Image source={{ uri: avatar }} accessibilityLabel={candidate ? '待上传头像预览' : '当前头像'} style={{ width: 104, height: 104 }} onError={() => setFailedAvatar(avatar)} /> : <CircleUserRound size={52} color={colors.brand} />}</View>
      {candidate && <Text style={ui.muted}>待上传 · {Math.ceil(candidate.size / 1024)}KB</Text>}
      <ActionButton label={busy === 'select' ? '正在处理图片' : '选择头像'} icon={ImagePlus} secondary disabled={!!busy} onPress={() => void choose()} />
      {candidate && <View style={{ gap: 12, alignSelf: 'stretch' }}><ActionButton label={busy === 'upload' ? '正在上传' : '确认上传头像'} icon={Upload} disabled={!!busy || failedAvatar === candidate.uri} onPress={() => void saveAvatar()} /><ActionButton label="取消选择" icon={X} secondary disabled={!!busy} onPress={() => { setCandidate(null); setError('') }} /></View>}
    </View>
    <View style={ui.section}><Text style={ui.body}>昵称</Text><TextInput accessibilityLabel="昵称" value={nickname} onChangeText={setNickname} editable={!busy} maxLength={32} style={ui.input} returnKeyType="done" onSubmitEditing={() => void saveNickname()} /><Text style={[ui.muted, { textAlign: 'right' }]}>{nickname.length}/32</Text><ActionButton label={busy === 'nickname' ? '正在保存' : '保存昵称'} icon={Save} disabled={!!busy || nickname === (saved.nickname || '')} onPress={() => void saveNickname()} /></View>
    <ErrorNotice error={error} />{notice && <Text accessibilityLiveRegion="polite" style={{ paddingVertical: 16, color: colors.income }}>{notice}</Text>}
    <Sheet visible={guard.confirming} title="放弃未保存的修改？" onClose={guard.keepEditing}><Text style={ui.body}>尚未保存的昵称和未上传的头像将被丢弃；已保存的资料不受影响。</Text><ActionButton label="继续编辑" icon={Pencil} onPress={guard.keepEditing} /><ActionButton label="放弃修改" icon={X} secondary onPress={guard.discard} /></Sheet>
  </>
}
