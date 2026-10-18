const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
let passed = 0
function load(relative, modules = {}, globals = {}) {
  const file = path.join(root, relative)
  // Execute helpers only; transpilation does not run the TypeScript checker.
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, ...globals, require: name => modules[name] || {} }, { filename: relative })
  return exports
}
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`) }

function appearanceFixture({ os = 'android', saved = 'false', initialDark = false, native = true, sync, failRead = false, failSave = false } = {}) {
  const states = [], effects = [], calls = []
  let cursor = 0, mounted = false
  const bridge = { initialDark, setDark: async dark => { calls.push(['native', dark]); await sync?.(dark) } }
  const storage = {
    getItemAsync: async () => { if (failRead) throw new Error('read failed'); return saved },
    setItemAsync: async (key, value) => { calls.push(['save', value]); if (failSave) throw new Error('save failed'); saved = value },
  }
  const provider = load('src/providers/ThemeProvider.tsx', {
    react: {
      useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value }] },
      useEffect: effect => { if (!mounted) effects.push(effect) },
      useMemo: create => create(),
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': { Platform: { OS: os }, NativeModules: native ? { ChaiAppearance: bridge } : {} },
    'expo-secure-store': storage,
    '../theme': { colors: { canvas: 'light' }, darkColors: { canvas: 'dark' }, createUI: colors => colors, ThemeContext: { Provider: 'Provider' } },
  }, { localStorage: { getItem: () => saved, setItem: (key, value) => { saved = value; calls.push(['web-save', value]) } } })
  const render = () => { cursor = 0; return provider.ThemeProvider({ children: null }).props.value }
  const first = render()
  mounted = true
  const cleanups = effects.map(effect => effect())
  return { first, render, calls, unmount: () => cleanups.forEach(cleanup => cleanup?.()) }
}

const flush = () => new Promise(resolve => setImmediate(resolve))

async function main() {
  const bookkeeping = load('src/lib/bookkeeping.ts')
  const insights = load('src/lib/insights.ts', { './bookkeeping': bookkeeping })
  const record = load('app/record.tsx', { '../src/lib/bookkeeping': bookkeeping, '../src/lib/insights': insights })
  for (const [input, result] of [
    ['0.1+0.2', '0.30'], ['12.34-2.14', '10.20'], ['10+2-3', '9.00'], ['12+', '12.00'],
    ['12.', '12.00'], ['99999999999999.99', '99999999999999.99'], ['99999999999999.99-99999999999999.98', '0.01'],
    ['', null], ['0', null], ['1-2', null], ['1-1', null], ['1++2', null], ['1e2', null], ['1/2', null],
    ['1.001', null], ['99999999999999.99+0.01', null], ['alert(1)', null],
  ]) await test(`exact keypad expression ${input}`, () => assert.equal(record.resolveAmountExpression(input), result))
  for (const [value, key, expected] of [
    ['', '.', '0.'], ['2+', '.', '2+0.'], ['0', '2', '2'], ['2+0', '3', '2+3'],
    ['1.23', '4', '1.23'], ['1.', '.', '1.'], ['12', 'backspace', '1'], ['1+', '-', '1+'],
    ['', '+', ''], ['12.', '+', '12.'], ['99999999999999', '9', '99999999999999'], ['3', 'x', '3'],
  ]) await test(`keypad key ${value} ${key}`, () => assert.equal(record.nextAmountExpression(value, key), expected))
  const calls = []
  let pages = []
  const stats = load('app/(tabs)/stats.tsx', { '../../src/api/transactions': { getTransactions: async (params, signal) => {
    assert.equal(signal.aborted, false)
    calls.push(params)
    return pages[params.page - 1]
  } } })
  function page(index, list, totalPages = 3) { return { list, pagination: { page: index, totalPages } } }
  await test('day details cross page boundaries and deduplicate', async () => {
    pages = [page(1, [{ date: '2026-10-16', items: [{ id: 'new' }] }, { date: '2026-10-15', items: [{ id: 'a' }] }]), page(2, [{ date: '2026-10-15', items: [{ id: 'a' }, { id: 'b' }] }]), page(3, [{ date: '2026-10-15', items: [{ id: 'c' }] }])]
    const result = await stats.loadDayTransactions('book', '2026-10', '2026-10-15', new AbortController().signal)
    assert.deepEqual(Array.from(result, item => item.id), ['a', 'b', 'c'])
    assert.equal(calls.length, 3)
  })
  await test('day query stops once older dates are reached', async () => {
    calls.length = 0
    pages = [page(1, [{ date: '2026-10-15', items: [{ id: 'a' }] }, { date: '2026-10-14', items: [{ id: 'old' }] }])]
    const result = await stats.loadDayTransactions('book', '2026-10', '2026-10-15', new AbortController().signal)
    assert.equal(result.length, 1)
    assert.equal(calls.length, 1)
  })
  await test('empty day is not populated with adjacent days', async () => {
    pages = [page(1, [{ date: '2026-10-14', items: [{ id: 'old' }] }])]
    assert.equal((await stats.loadDayTransactions('book', '2026-10', '2026-10-15', new AbortController().signal)).length, 0)
  })
  await test('aborted day query rejects instead of showing partial results', async () => {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(() => stats.loadDayTransactions('book', '2026-10', '2026-10-15', controller.signal))
  })
  const theme = load('src/theme.ts', { react: { createContext: value => value }, 'react-native': { StyleSheet: { create: value => value, hairlineWidth: 1 } } })
  await test('light and dark tokens have matching keys', () => assert.deepEqual(Object.keys(theme.colors), Object.keys(theme.darkColors)))
  await test('shared styles are created from the selected palette', () => {
    for (const colors of [theme.colors, theme.darkColors]) {
      const ui = theme.createUI(colors)
      assert.equal(ui.input.backgroundColor, colors.surface)
      assert.equal(ui.body.color, colors.secondary)
      assert.equal(ui.card.backgroundColor, colors.surface)
      assert.equal(colors.onBrand, '#FFFFFF')
    }
  })
  await test('native dark preference colors the first React frame before secure storage resolves', async () => {
    const fixture = appearanceFixture({ initialDark: true, saved: 'true' })
    assert.equal(fixture.first.dark, true)
    assert.equal(fixture.first.colors.canvas, 'dark')
    assert.equal(fixture.first.ready, false)
    await flush()
    assert.equal(fixture.render().ready, true)
    assert.deepEqual(fixture.calls, [['native', true]])
  })
  await test('existing SecureStore preference migrates to native before ready', async () => {
    let finish
    const fixture = appearanceFixture({ saved: 'true', sync: () => new Promise(resolve => { finish = resolve }) })
    await flush()
    assert.equal(fixture.render().dark, true)
    assert.equal(fixture.render().ready, false)
    finish()
    await flush()
    assert.equal(fixture.render().ready, true)
  })
  await test('rapid toggles persist and synchronize in order', async () => {
    const fixture = appearanceFixture()
    await flush()
    fixture.calls.length = 0
    const value = fixture.render()
    value.setDark(true)
    value.setDark(false)
    value.setDark(true)
    await flush()
    assert.equal(fixture.render().dark, true)
    assert.deepEqual(fixture.calls, [['save', 'true'], ['native', true], ['save', 'false'], ['native', false], ['save', 'true'], ['native', true]])
  })
  await test('light selection overrides an earlier native dark preference', async () => {
    const fixture = appearanceFixture({ initialDark: true, saved: 'false' })
    await flush()
    assert.equal(fixture.render().dark, false)
    assert.deepEqual(fixture.calls, [['native', false]])
  })
  await test('missing secure preference retains the native selection', async () => {
    const fixture = appearanceFixture({ initialDark: true, saved: null })
    await flush()
    assert.equal(fixture.render().dark, true)
  })
  await test('read failure retains native colors and releases the splash with an error', async () => {
    const fixture = appearanceFixture({ initialDark: true, failRead: true })
    await flush()
    assert.equal(fixture.render().dark, true)
    assert.equal(fixture.render().ready, true)
    assert.ok(fixture.render().error)
  })
  await test('native synchronization failure does not leave startup blocked', async () => {
    const fixture = appearanceFixture({ saved: 'true', sync: () => { throw new Error('native failure') } })
    await flush()
    assert.equal(fixture.render().dark, true)
    assert.equal(fixture.render().ready, true)
    assert.ok(fixture.render().error)
  })
  await test('save failure is visible without changing native mode to an unpersisted choice', async () => {
    const fixture = appearanceFixture({ failSave: true })
    await flush()
    fixture.calls.length = 0
    fixture.render().setDark(true)
    await flush()
    assert.equal(fixture.render().dark, true)
    assert.ok(fixture.render().error)
    assert.deepEqual(fixture.calls, [['save', 'true']])
  })
  await test('Expo Go without custom native module retains JS theme support', async () => {
    const fixture = appearanceFixture({ native: false, saved: 'true' })
    await flush()
    assert.equal(fixture.render().dark, true)
    assert.equal(fixture.render().error, '')
  })
  await test('web appearance does not call the Android bridge', async () => {
    const fixture = appearanceFixture({ os: 'web', saved: 'true' })
    await flush()
    fixture.render().setDark(false)
    await flush()
    assert.equal(fixture.render().dark, false)
    assert.deepEqual(fixture.calls, [['web-save', 'false']])
  })
  await test('unmount during secure restore does not update native appearance', async () => {
    const fixture = appearanceFixture({ saved: 'true' })
    fixture.unmount()
    await flush()
    assert.deepEqual(fixture.calls, [])
  })
  await test('appearance plugin regenerates matching Kotlin and is idempotent', async () => {
    const callbacks = {}, writes = []
    const pluginModule = { exports: {} }
    vm.runInNewContext(fs.readFileSync(path.join(root, 'plugins/with-android-appearance.js'), 'utf8'), {
      module: pluginModule,
      require: name => {
        if (name === 'node:path') return path
        if (name === 'node:fs/promises') return { mkdir: async () => {}, writeFile: async (file, content) => writes.push({ file, content }) }
        if (name === 'expo/config-plugins') return Object.fromEntries(['withMainApplication', 'withMainActivity', 'withAndroidColorsNight', 'withDangerousMod'].map(key => [key, (config, callback) => { callbacks[key] = Array.isArray(callback) ? callback[1] : callback; return config }]))
        throw new Error(`Unexpected plugin dependency ${name}`)
      },
    })
    pluginModule.exports({ android: { package: 'me.sikehuhu.chai' } })
    for (const [key, filename] of [['withMainApplication', 'MainApplication.kt'], ['withMainActivity', 'MainActivity.kt']]) {
      const current = fs.readFileSync(path.join(root, 'android/app/src/main/java/me/sikehuhu/chai', filename), 'utf8').replace(/\r\n/g, '\n')
      const pristine = current.replace('          add(ChaiAppearancePackage())\n', '').replace('    // Expo applies its interface style during onCreate; restore the explicit app preference.\n', '').replaceAll('    ChaiAppearanceModule.restore(this)\n', '')
      const mod = { modResults: { language: 'kt', contents: pristine } }
      assert.equal(callbacks[key](mod).modResults.contents, current)
      assert.equal(callbacks[key](mod).modResults.contents, current)
    }
    const colors = { modResults: { resources: { color: [{ $: { name: 'splashscreen_background' }, _: '#F9F9FF' }] } } }
    callbacks.withAndroidColorsNight(colors)
    callbacks.withAndroidColorsNight(colors)
    assert.equal(colors.modResults.resources.color.length, 2)
    assert.ok(colors.modResults.resources.color.every(color => color._ === theme.darkColors.canvas))
    await callbacks.withDangerousMod({ modRequest: { platformProjectRoot: path.join(root, 'android') } })
    assert.equal(writes.length, 1)
    assert.equal(writes[0].content, fs.readFileSync(writes[0].file, 'utf8').replace(/\r\n/g, '\n'))
  })
  console.log(`\n${passed} UI adaptation runtime checks passed. No network or type checking.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
