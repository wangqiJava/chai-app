const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
let passed = 0
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`) }
function load(relative, modules = {}, globals = {}) {
  const file = path.join(root, relative)
  // Runtime transpilation only; never invoke a type checker or live API.
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, FormData, Blob, Uint8Array, TextEncoder, atob, window: undefined, ...globals, require: name => {
    if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`)
    return modules[name]
  } }, { filename: relative })
  return exports
}
const plain = value => JSON.parse(JSON.stringify(value))

function imageFixture(os = 'web', options = {}) {
  const state = { crop: null, resize: null, saved: [], contextsReleased: 0, imagesReleased: 0, fields: [] }
  const modules = {
    'react-native': { Platform: { OS: os } },
    'expo-file-system': { File: class {
      constructor(uri) { this.uri = uri }
      get exists() { return options.fileMissing !== true }
      get size() { return options.fileSize ?? 4 }
      get type() { return options.fileType ?? 'image/jpeg' }
      get name() { return this.uri.split('/').pop() }
      async bytes() { return Uint8Array.from([255, 216, 255, 217]) }
    } },
    'expo-image-manipulator': {
      SaveFormat: { JPEG: 'jpeg' },
      ImageManipulator: { manipulate: () => ({
        crop: value => { state.crop = value }, resize: value => { state.resize = value },
        release: () => { state.contextsReleased++ },
        renderAsync: async () => {
          if (options.renderError) throw new Error('decode failed')
          return {
            release: () => { state.imagesReleased++ },
            saveAsync: async config => {
              state.saved.push(config)
              options.onSave?.()
              return { uri: 'file:///avatar.jpg', base64: options.oversize || (options.firstLarge && state.saved.length === 1) ? 'A'.repeat(700000) : '/9j/2Q==' }
            },
          }
        },
      }) },
    },
  }
  const nativeForm = class { constructor() { this._parts = state.fields } }
  load('node_modules/expo/src/winter/FormData.ts').installFormDataPatch(nativeForm)
  return { state, api: load('src/lib/avatar.ts', modules, os === 'web' ? {} : { FormData: nativeForm }) }
}

function guardFixture(dirty, busy = false, os = 'web') {
  const state = { callback: null, enabled: false, dispatched: [], values: [], handlers: {}, cleanups: [] }
  const modules = {
    react: { useRef: value => ({ current: value }), useState: value => [value, next => state.values.push(next)], useEffect: effect => { const cleanup = effect(); if (cleanup) state.cleanups.push(cleanup) } },
    'react-native': { Platform: { OS: os } },
    'expo-router': { useNavigation: () => ({ dispatch: action => state.dispatched.push(action) }) },
    'expo-router/react-navigation': { usePreventRemove: (enabled, callback) => { state.enabled = enabled; state.callback = callback } },
  }
  const window = { addEventListener: (event, callback) => { state.handlers[event] = callback }, removeEventListener: event => { delete state.handlers[event] } }
  return { state, guard: load('src/hooks/useUnsavedChanges.ts', modules, { window }).useUnsavedChanges(dirty, busy) }
}

async function main() {
  const api = imageFixture().api
  for (const [value, size] of [['YQ==', 1], ['YWI=', 2], ['YWJj', 3], ['/9j/2Q==', 4]]) {
    await test(`base64 size ${value}`, () => assert.equal(api.base64Bytes(value), size))
  }
  for (const value of ['', 'ab', '====', 'YW Jj', 'YQ===', 'data:image/jpeg;base64,YQ==']) {
    await test(`reject malformed base64 ${JSON.stringify(value)}`, () => assert.throws(() => api.base64Bytes(value)))
  }
  const asset = { uri: 'file:///original.png', width: 1200, height: 800, type: 'image' }
  await test('center crop, bounded resize and JPEG output', async () => {
    const { state, api } = imageFixture()
    const image = await api.prepareAvatar(asset)
    assert.deepEqual(plain(state.crop), { originX: 200, originY: 0, width: 800, height: 800 })
    assert.deepEqual(plain(state.resize), { width: 400, height: 400 })
    assert.equal(state.saved[0].format, 'jpeg')
    assert.equal(image.size, 4)
    assert.equal(state.contextsReleased, 1)
    assert.equal(state.imagesReleased, 1)
  })
  await test('small images are not upscaled', async () => {
    const { state, api } = imageFixture()
    await api.prepareAvatar({ ...asset, width: 100, height: 80 })
    assert.deepEqual(plain(state.resize), { width: 80, height: 80 })
  })
  await test('oversized first output retries compression', async () => {
    const { state, api } = imageFixture('web', { firstLarge: true })
    await api.prepareAvatar(asset)
    assert.deepEqual(state.saved.map(item => item.compress), [0.85, 0.65])
  })
  await test('reject oversized avatar after bounded attempts', async () => {
    const { state, api } = imageFixture('web', { oversize: true })
    await assert.rejects(api.prepareAvatar(asset), /512KB/)
    assert.equal(state.saved.length, 3)
    assert.equal(state.imagesReleased, 1)
    assert.equal(state.contextsReleased, 1)
  })
  for (const change of [{ width: 0 }, { height: -1 }, { width: NaN }, { uri: '' }, { type: 'video' }]) {
    await test(`reject invalid asset ${JSON.stringify(change)}`, () => assert.rejects(api.prepareAvatar({ ...asset, ...change })))
  }
  await test('decode failure releases native context', async () => {
    const { state, api } = imageFixture('web', { renderError: true })
    await assert.rejects(api.prepareAvatar(asset), /decode failed/)
    assert.equal(state.contextsReleased, 1)
  })
  await test('cancel before manipulation', async () => {
    const controller = new AbortController(); controller.abort()
    const { state, api } = imageFixture()
    await assert.rejects(api.prepareAvatar(asset, controller.signal), /取消/)
    assert.equal(state.saved.length, 0)
  })
  await test('cancel during compression drops result and releases resources', async () => {
    const controller = new AbortController()
    const { state, api } = imageFixture('web', { onSave: () => controller.abort() })
    await assert.rejects(api.prepareAvatar(asset, controller.signal), /取消/)
    assert.equal(state.saved.length, 1)
    assert.equal(state.imagesReleased, 1)
  })
  const prepared = { uri: 'file:///avatar.jpg', base64: '/9j/2Q==', size: 4 }
  await test('web multipart has exactly one JPEG file', async () => {
    const form = api.avatarFormData(prepared)
    assert.deepEqual([...form.keys()], ['file'])
    assert.equal(form.get('file').type, 'image/jpeg')
    assert.equal(form.get('file').name, 'avatar.jpg')
    assert.equal(form.get('file').size, 4)
  })
  await test('native multipart provides a readable Expo File', () => {
    const { state, api } = imageFixture('android')
    api.avatarFormData(prepared)
    assert.equal(state.fields.length, 1)
    assert.equal(state.fields[0][0], 'file')
    assert.equal(state.fields[0][1].uri, prepared.uri)
    assert.equal(state.fields[0][1].name, 'avatar.jpg')
    assert.equal(state.fields[0][1].type, 'image/jpeg')
    assert.equal(typeof state.fields[0][1].bytes, 'function')
  })
  const converter = load('node_modules/expo/src/winter/fetch/convertFormData.ts', {
    '../../utils/blobUtils': { blobToArrayBufferAsync: blob => blob.arrayBuffer() },
  })
  await test('installed Expo serializer reproduces legacy URI upload failure', async () => {
    await assert.rejects(converter.convertFormDataAsync({ entries: () => [['file', { uri: prepared.uri, name: 'avatar.jpg', type: 'image/jpeg' }]] }), /Unsupported FormDataPart/)
  })
  for (const os of ['android', 'web']) {
    await test(`${os} multipart serializes real JPEG bytes with installed Expo converter`, async () => {
      const { api } = imageFixture(os)
      const form = api.avatarFormData(prepared)
      const { body, boundary } = await converter.convertFormDataAsync(form)
      const parsed = await new Response(body, { headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` } }).formData()
      assert.deepEqual([...parsed.keys()], ['file'])
      const file = parsed.get('file')
      assert.equal(file.name, 'avatar.jpg')
      assert.equal(file.type, 'image/jpeg')
      assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [255, 216, 255, 217])
      // An auth refresh can replay the same body without consuming the native file.
      const replay = await converter.convertFormDataAsync(form, boundary)
      assert.deepEqual([...replay.body], [...body])
    })
  }
  for (const options of [{ fileMissing: true }, { fileSize: 5 }, { fileType: 'image/png' }]) {
    await test(`native multipart rejects unreadable or changed file ${JSON.stringify(options)}`, () => {
      assert.throws(() => imageFixture('android', options).api.avatarFormData(prepared), /重新选择图片/)
    })
  }
  await test('multipart rejects tampered size, empty URI and oversized file', () => {
    assert.throws(() => api.avatarFormData({ ...prepared, size: 100 }))
    assert.throws(() => api.avatarFormData({ ...prepared, uri: '' }))
    assert.throws(() => api.avatarFormData({ ...prepared, base64: 'A'.repeat(700000), size: 525000 }))
  })

  const calls = []
  const auth = load('src/api/auth.ts', {
    '../lib/http': { request: async (url, options) => { calls.push({ url, options }); return { id: 'u1' } } },
    '../lib/token-storage': {},
  })
  await test('nickname update sends only nickname with cancellation', async () => {
    const signal = new AbortController().signal
    await auth.updateProfile('新昵称', signal)
    assert.equal(calls[0].url, '/user/profile')
    assert.equal(calls[0].options.method, 'PUT')
    assert.equal(calls[0].options.signal, signal)
    assert.deepEqual(plain(calls[0].options.body), { nickname: '新昵称' })
  })
  await test('avatar update passes multipart unchanged with auth enabled', async () => {
    const form = api.avatarFormData(prepared)
    const signal = new AbortController().signal
    await auth.uploadAvatar(form, signal)
    assert.equal(calls[1].url, '/user/avatar')
    assert.equal(calls[1].options.method, 'POST')
    assert.equal(calls[1].options.body, form)
    assert.equal(calls[1].options.signal, signal)
    assert.notEqual(calls[1].options.auth, false)
  })
  await test('pristine form does not install navigation or unload guard', () => {
    const { state } = guardFixture(false)
    assert.equal(state.enabled, false)
    assert.equal(state.handlers.beforeunload, undefined)
  })
  await test('dirty form prompts once and preserves original action', () => {
    const { state, guard } = guardFixture(true)
    const action = { type: 'GO_BACK' }
    state.callback({ data: { action } })
    state.callback({ data: { action: { type: 'POP' } } })
    assert.deepEqual(state.values, [true])
    assert.equal(state.dispatched.length, 0)
    guard.discard()
    assert.equal(state.dispatched[0], action)
  })
  await test('continue editing does not navigate', () => {
    const { state, guard } = guardFixture(true)
    state.callback({ data: { action: { type: 'GO_BACK' } } })
    guard.keepEditing()
    guard.discard()
    assert.equal(state.dispatched.length, 0)
  })
  await test('busy mutation blocks return without discard prompt', () => {
    const { state, guard } = guardFixture(false, true)
    state.callback({ data: { action: { type: 'GO_BACK' } } })
    guard.discard()
    assert.equal(state.enabled, true)
    assert.equal(state.values.length, 0)
    assert.equal(state.dispatched.length, 0)
  })
  await test('successful save leaves without an unsaved prompt even while busy', () => {
    const { state, guard } = guardFixture(true, true)
    const action = { type: 'GO_BACK' }
    guard.complete(() => state.callback({ data: { action } }))
    assert.equal(state.dispatched[0], action)
    assert.ok(!state.values.includes(true))
  })
  await test('web reload blocked while dirty, released after save, cleanup removes listener', () => {
    const { state, guard } = guardFixture(true)
    let blocked = 0
    const event = { preventDefault: () => blocked++, returnValue: undefined }
    state.handlers.beforeunload(event)
    assert.equal(blocked, 1)
    guard.complete(() => {})
    state.handlers.beforeunload(event)
    assert.equal(blocked, 1)
    state.cleanups.forEach(cleanup => cleanup())
    assert.equal(state.handlers.beforeunload, undefined)
  })
  await test('native guard does not access browser globals', () => {
    const { state } = guardFixture(true, false, 'android')
    assert.equal(state.handlers.beforeunload, undefined)
    assert.equal(state.enabled, true)
  })
  const legal = load('src/lib/legal.ts')
  await test('legal copy declares draft scope and real feedback route', () => {
    assert.match(legal.LEGAL_NOTICE, /内测/)
    assert.ok(legal.terms.some(section => /小程序.*意见反馈/.test(section.text)))
    assert.ok(legal.privacy.some(section => /确认上传/.test(section.text)))
    assert.ok(legal.privacy.some(section => /OpenID/.test(section.text)))
    assert.equal(new URL(legal.SUPPORT_URL).protocol, 'https:')
  })
  console.log(`\n${passed} profile checks passed. No live API, native device, or TypeScript type checks were used.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
