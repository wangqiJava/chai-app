import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: '柴记账',
  slug: 'chai-app',
  version: '0.1.0',
  icon: './assets/icon.png',
  scheme: 'chai-accounting',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#F9F9FF',
  platforms: ['android', 'web'],
  android: {
    package: 'me.sikehuhu.chai',
    versionCode: 5,
    softwareKeyboardLayoutMode: 'resize',
    permissions: [],
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.READ_CONTACTS', 'android.permission.CAMERA'],
  },
  web: { bundler: 'metro', output: 'single', name: '柴记账' },
  plugins: ['expo-router', 'expo-secure-store', 'expo-system-ui', ['expo-image-picker', {
    photosPermission: '仅在你选择头像时读取所选图片。',
    cameraPermission: false,
    microphonePermission: false,
  }], ['expo-splash-screen', {
    image: './assets/splash-icon.png',
    imageWidth: 120,
    resizeMode: 'contain',
    backgroundColor: '#F9F9FF',
    dark: { backgroundColor: '#0F172A' },
  }], './plugins/with-local-android-signing', './plugins/with-android-appearance'],
}

export default config
