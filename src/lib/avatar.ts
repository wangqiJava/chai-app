import { Platform } from 'react-native'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import type { ImagePickerAsset } from 'expo-image-picker'
import { File } from 'expo-file-system'

export const MAX_AVATAR_BYTES = 512 * 1024
export type PreparedAvatar = { uri: string, base64: string, size: number }

export function base64Bytes(value: string) {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('头像处理失败，请重新选择图片')
  return value.length / 4 * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0)
}

function assertActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('操作已取消')
}

export async function prepareAvatar(asset: ImagePickerAsset, signal?: AbortSignal): Promise<PreparedAvatar> {
  assertActive(signal)
  if (!asset.uri || !Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0) throw new Error('无法读取图片，请重新选择')
  if (asset.type && asset.type !== 'image') throw new Error('请选择静态图片')
  const side = Math.min(asset.width, asset.height)
  const context = ImageManipulator.manipulate(asset.uri)
  try {
    context.crop({ originX: Math.floor((asset.width - side) / 2), originY: Math.floor((asset.height - side) / 2), width: side, height: side })
    context.resize({ width: Math.min(400, side), height: Math.min(400, side) })
    const rendered = await context.renderAsync()
    try {
      for (const compress of [0.85, 0.65, 0.45]) {
        assertActive(signal)
        const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress, base64: true })
        assertActive(signal)
        const base64 = image.base64 || ''
        const size = base64Bytes(base64)
        if (size <= MAX_AVATAR_BYTES) return { uri: image.uri, base64, size }
      }
      throw new Error('头像压缩后仍超过 512KB，请换一张图片')
    } finally { rendered.release() }
  } finally { context.release() }
}

export function avatarFormData(image: PreparedAvatar) {
  const size = base64Bytes(image.base64)
  if (!image.uri || size !== image.size || size > MAX_AVATAR_BYTES) throw new Error('头像文件无效或超过 512KB')
  const form = new FormData()
  if (Platform.OS === 'web') {
    const bytes = Uint8Array.from(atob(image.base64), character => character.charCodeAt(0))
    form.append('file', new Blob([bytes], { type: 'image/jpeg' }), 'avatar.jpg')
  } else {
    const file = new File(image.uri)
    if (!file.exists || file.size !== size || file.type !== 'image/jpeg') throw new Error('头像临时文件无法读取，请重新选择图片')
    // Expo fetch reads File.bytes(); the legacy React Native URI object is unsupported.
    form.append('file', file)
  }
  return form
}
