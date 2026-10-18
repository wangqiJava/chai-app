const { withAppBuildGradle, withGradleProperties, withProjectBuildGradle } = require('expo/config-plugins')

const startMarker = '// chai-local-signing:start'
const endMarker = '// chai-local-signing:end'
const signingBlock = `${startMarker}
def chaiSigning = [
    store: System.getenv('CHAI_SIGN_STORE_FILE'),
    storePassword: System.getenv('CHAI_SIGN_STORE_PASS'),
    alias: System.getenv('CHAI_SIGN_KEY_ALIAS'),
    keyPassword: System.getenv('CHAI_SIGN_KEY_PASS')
]

android {
    signingConfigs {
        chaiRelease {
            if (chaiSigning.store) storeFile file(chaiSigning.store)
            storePassword chaiSigning.storePassword
            keyAlias chaiSigning.alias
            keyPassword chaiSigning.keyPassword
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.chaiRelease
        }
    }
}

// Never fall back to the template's debug key for a release build.
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.project == project && it.name.toLowerCase().contains('release') }) {
        if (chaiSigning.values().any { !it }) {
            throw new GradleException('Missing local signing credentials. Use scripts/build-android.ps1.')
        }
    }
}
${endMarker}`

module.exports = function withLocalAndroidSigning(config) {
  config = withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('Expected a Groovy root Gradle file.')
    const cacheBlock = `
// chai-windows-cmake-cache
if (System.getProperty('os.name').toLowerCase().contains('windows')) {
    subprojects { child ->
        ['com.android.application', 'com.android.library'].each { pluginId ->
            child.plugins.withId(pluginId) {
                child.extensions.getByName('android').externalNativeBuild.cmake.buildStagingDirectory = rootProject.file('.cxx/' + child.name)
            }
        }
    }
}
`
    const source = mod.modResults.contents.replace(cacheBlock, '')
    const anchor = 'apply plugin: "expo-root-project"'
    if (!source.includes(anchor)) throw new Error('Expected Expo root Gradle plugin anchor was not found.')
    const ninjaBlock = `
// chai-windows-ninja
if (System.getProperty('os.name').toLowerCase().contains('windows') && System.getenv('CHAI_NINJA_PATH')) {
    subprojects { child ->
        ['com.android.application', 'com.android.library'].each { pluginId ->
            child.plugins.withId(pluginId) {
                child.extensions.getByName('android').defaultConfig.externalNativeBuild.cmake.arguments.add('-DCMAKE_MAKE_PROGRAM=' + System.getenv('CHAI_NINJA_PATH'))
            }
        }
    }
}
`
    mod.modResults.contents = source.replace(ninjaBlock, '').replace(anchor, `${cacheBlock}${ninjaBlock}${anchor}`)
    return mod
  })
  config = withGradleProperties(config, (mod) => {
    const property = mod.modResults.find(item => item.type === 'property' && item.key === 'android.cmakeVersion')
    if (property) property.value = '3.30.5'
    else mod.modResults.push({ type: 'property', key: 'android.cmakeVersion', value: '3.30.5' })
    return mod
  })
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('Local Android signing requires the Expo Groovy template.')
    }
    const source = mod.modResults.contents
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker)
    if ((start === -1) !== (end === -1) || (start !== -1 && end < start)) {
      throw new Error('Incomplete local signing block; inspect android/app/build.gradle before retrying.')
    }
    mod.modResults.contents = start === -1
      ? `${source}\n${signingBlock}\n`
      : `${source.slice(0, start)}${signingBlock}${source.slice(end + endMarker.length)}`
    return mod
  })
}
