const fs = require('node:fs/promises')
const path = require('node:path')
const { withAndroidColorsNight, withDangerousMod, withMainActivity, withMainApplication } = require('expo/config-plugins')

const nativeSource = `package me.sikehuhu.chai

import android.app.UiModeManager
import android.content.Context
import android.os.Build
import androidx.appcompat.app.AppCompatDelegate
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.ViewManager

class ChaiAppearancePackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(ChaiAppearanceModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class ChaiAppearanceModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "ChaiAppearance"

  override fun getConstants(): Map<String, Any> = mapOf("initialDark" to savedDark(reactApplicationContext))

  @ReactMethod
  fun setDark(dark: Boolean, promise: Promise) {
    try {
      val saved = reactApplicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putBoolean(DARK, dark).commit()
      if (!saved) {
        promise.reject("APPEARANCE_SAVE", "Unable to save application appearance")
        return
      }
      UiThreadUtil.runOnUiThread {
        try {
          applyMode(reactApplicationContext, dark)
          promise.resolve(null)
        } catch (error: Exception) {
          promise.reject("APPEARANCE_APPLY", error)
        }
      }
    } catch (error: Exception) {
      promise.reject("APPEARANCE_SAVE", error)
    }
  }

  companion object {
    private const val PREFS = "chai_appearance"
    private const val DARK = "dark"

    private fun savedDark(context: Context): Boolean =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(DARK, false)

    fun restore(context: Context) {
      applyMode(context, savedDark(context))
    }

    private fun applyMode(context: Context, dark: Boolean) {
      // Android 12+ retains this app-only mode for the system splash, before JS starts.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.getSystemService(UiModeManager::class.java).setApplicationNightMode(
          if (dark) UiModeManager.MODE_NIGHT_YES else UiModeManager.MODE_NIGHT_NO
        )
      }
      AppCompatDelegate.setDefaultNightMode(
        if (dark) AppCompatDelegate.MODE_NIGHT_YES else AppCompatDelegate.MODE_NIGHT_NO
      )
    }
  }
}
`

function insertOnce(source, anchor, insertion) {
  if (source.includes(insertion.trim())) return source
  if (!source.includes(anchor)) throw new Error(`Android appearance anchor not found: ${anchor}`)
  return source.replace(anchor, `${anchor}\n${insertion}`)
}

module.exports = function withAndroidAppearance(config) {
  if (config.android?.package !== 'me.sikehuhu.chai') throw new Error('Unexpected application package for Chai appearance module')
  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Android appearance requires Kotlin application')
    let source = insertOnce(mod.modResults.contents, 'PackageList(this).packages.apply {', '          add(ChaiAppearancePackage())')
    source = insertOnce(source, 'super.onCreate()', '    ChaiAppearanceModule.restore(this)')
    mod.modResults.contents = source
    return mod
  })
  config = withMainActivity(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Android appearance requires Kotlin activity')
    let source = insertOnce(mod.modResults.contents, 'override fun onCreate(savedInstanceState: Bundle?) {', '    ChaiAppearanceModule.restore(this)')
    const afterCreate = '    // Expo applies its interface style during onCreate; restore the explicit app preference.\n    ChaiAppearanceModule.restore(this)'
    source = insertOnce(source, 'super.onCreate(null)', afterCreate)
    mod.modResults.contents = source
    return mod
  })
  config = withAndroidColorsNight(config, mod => {
    mod.modResults.resources.color ??= []
    for (const name of ['splashscreen_background', 'activityBackground']) {
      const color = mod.modResults.resources.color.find(item => item.$.name === name)
      if (color) color._ = '#0F172A'
      else mod.modResults.resources.color.push({ $: { name }, _: '#0F172A' })
    }
    return mod
  })
  return withDangerousMod(config, ['android', async mod => {
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java/me/sikehuhu/chai')
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, 'ChaiAppearancePackage.kt'), nativeSource)
    return mod
  }])
}
