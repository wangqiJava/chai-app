const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
let passed = 0
function test(name, action) {
  return Promise.resolve().then(action).then(() => { passed++; console.log(`PASS ${name}`) })
}
function load(relative, modules = {}) {
  const file = path.join(root, relative)
  // Transpile only: no type checker, filesystem writes, or real network/storage dependencies.
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, Error, AbortController, require: name => {
    if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`)
    return modules[name]
  } }, { filename: relative })
  return exports
}
function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const plain = value => JSON.parse(JSON.stringify(value))

async function main() {
  const helpers = load('src/lib/bookkeeping.ts')
  for (const [input, output] of [['.5', '0.50'], ['0001.2', '1.20'], ['1.', '1.00'], ['0.01', '0.01'], ['99999999999999.99', '99999999999999.99']]) {
    await test(`amount ${input}`, () => assert.equal(helpers.normalizeAmount(input), output))
  }
  for (const input of ['', '.', '0', '00.00', '-1', '1e3', '1.001', '100000000000000', 'NaN', ' 1', '1,000']) {
    await test(`reject amount ${JSON.stringify(input)}`, () => assert.equal(helpers.normalizeAmount(input), null))
  }
  for (const input of ['2024-02-29', '2000-02-29', '2026-12-31', '1900-01-01', '9999-12-31']) {
    await test(`valid date ${input}`, () => assert.equal(helpers.validDate(input), true))
  }
  for (const input of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-1-1', '0099-01-01', '2026-10-01T12:00:00Z']) {
    await test(`reject date ${input}`, () => assert.equal(helpers.validDate(input), false))
  }
  await test('money display preserves decimal precision', () => {
    assert.equal(helpers.formatMoney('99999999999999.99'), '99,999,999,999,999.99')
    assert.equal(helpers.formatMoney('-1234.5'), '-1,234.50')
    assert.equal(helpers.formatMoney('0'), '0.00')
    assert.equal(helpers.formatMoney(undefined), '--')
    assert.equal(helpers.formatMoney('invalid'), '--')
  })
  await test('dates use local calendar, not UTC conversion', () => {
    const date = new Date(2026, 0, 2, 0, 1)
    assert.equal(helpers.todayKey(date), '2026-01-02')
    assert.equal(helpers.monthKey(date), '2026-01')
  })
  await test('deleted selection falls back to default ledger', () => {
    const ledgers = [{ id: 'a', isDefault: false }, { id: 'b', isDefault: true }]
    assert.equal(helpers.resolveLedger(ledgers, 'a').id, 'a')
    assert.equal(helpers.resolveLedger(ledgers, 'deleted').id, 'b')
    assert.equal(helpers.resolveLedger(ledgers, null).id, 'b')
    assert.equal(helpers.resolveLedger([{ id: 'a' }], null).id, 'a')
    assert.equal(helpers.resolveLedger([], 'a'), null)
  })
  await test('merge split days without duplicate transactions', () => {
    const pages = [
      { list: [{ date: '2026-10-02', items: [{ id: 'a' }, { id: 'b' }] }] },
      { list: [{ date: '2026-10-02', items: [{ id: 'b' }, { id: 'c' }] }, { date: '2026-10-01', items: [{ id: 'd' }, { id: 'a' }] }] },
    ]
    const before = JSON.stringify(pages)
    assert.deepEqual(plain(helpers.mergeTransactionPages(pages)), [{ date: '2026-10-02', items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, { date: '2026-10-01', items: [{ id: 'd' }] }])
    assert.equal(JSON.stringify(pages), before)
    assert.deepEqual(plain(helpers.mergeTransactionPages([])), [])
  })
  await test('pagination ends at server totalPages', () => {
    assert.equal(helpers.nextTransactionPage({ pagination: { page: 1, totalPages: 2 } }), 2)
    assert.equal(helpers.nextTransactionPage({ pagination: { page: 2, totalPages: 2 } }), undefined)
    assert.equal(helpers.nextTransactionPage({ pagination: { page: 1, totalPages: 0 } }), undefined)
  })

  const calls = []
  const apiModules = { '../lib/http': { request: async (url, options) => { calls.push({ url, options }); return { id: 'result' } } } }
  const ledgers = load('src/api/ledgers.ts', apiModules)
  const categories = load('src/api/categories.ts', apiModules)
  const transactions = load('src/api/transactions.ts', apiModules)
  const stats = load('src/api/stats.ts', apiModules)
  const signal = new AbortController().signal
  const input = { ledgerId: 'l1', categoryId: 'c1', type: 'EXPENSE', amount: '12.50', date: '2026-10-12', remark: '' }
  const contracts = [
    [() => ledgers.getLedgers(signal), '/ledgers', 'GET', undefined],
    [() => ledgers.createLedger('name', signal), '/ledgers', 'POST', { name: 'name' }],
    [() => ledgers.updateLedger('id/1', 'new', signal), '/ledgers/id%2F1', 'PUT', { name: 'new' }],
    [() => ledgers.deleteLedger('id/1', signal), '/ledgers/id%2F1', 'DELETE', undefined],
    [() => ledgers.setDefaultLedger('id/1', signal), '/ledgers/id%2F1/default', 'PATCH', undefined],
    [() => categories.getCategories('l1', signal), '/categories', 'GET', undefined],
    [() => categories.createCategory({ name: 'name', type: 'EXPENSE' }, signal), '/categories', 'POST', { name: 'name', type: 'EXPENSE' }],
    [() => categories.updateCategory('id/1', 'new', signal), '/categories/id%2F1', 'PUT', { name: 'new' }],
    [() => categories.deleteCategory('id/1', signal), '/categories/id%2F1', 'DELETE', undefined],
    [() => transactions.getTransactions({ ledgerId: 'l1', month: '2026-09', categoryId: 'c1', page: 2 }, signal), '/transactions', 'GET', undefined],
    [() => transactions.getTransaction('id/1', signal), '/transactions/id%2F1', 'GET', undefined],
    [() => transactions.createTransaction(input, signal), '/transactions', 'POST', input],
    [() => transactions.updateTransaction('id/1', input, signal), '/transactions/id%2F1', 'PUT', input],
    [() => transactions.deleteTransaction('id/1', signal), '/transactions/id%2F1', 'DELETE', undefined],
    [() => stats.getMonthlySummary('l1', '2026-09', signal), '/stats/summary', 'GET', undefined],
  ]
  for (const [call, url, method, body] of contracts) {
    await test(`${method} ${url}`, async () => {
      await call()
      const actual = calls.at(-1)
      assert.equal(actual.url, url)
      assert.equal(actual.options.method || 'GET', method)
      assert.equal(actual.options.signal, signal)
      assert.notEqual(actual.options.auth, false)
      assert.deepEqual(actual.options.body && plain(actual.options.body), body)
    })
  }
  await test('list filters and summary use the selected month', () => {
    assert.deepEqual(plain(calls[9].options.query), { ledgerId: 'l1', month: '2026-09', categoryId: 'c1', page: 2, pageSize: 20 })
    assert.deepEqual(plain(calls[14].options.query), { ledgerId: 'l1', month: '2026-09' })
    assert.deepEqual(plain(calls[5].options.query), { ledgerId: 'l1' })
  })

  function mutationFixture() {
    const state = { generation: 1, cleanup: null, values: [], invalidations: 0, refresh: Promise.resolve() }
    class ApiError extends Error { constructor(message, status) { super(message); this.status = status } }
    const modules = {
      react: { useEffect: effect => { state.cleanup = effect() }, useRef: value => ({ current: value }), useState: value => [value, next => state.values.push(next)] },
      'react/jsx-runtime': {}, 'react-native': { StyleSheet: { create: value => value } }, 'react-native-safe-area-context': {}, 'lucide-react-native': {},
      '../lib/http': { ApiError }, '../lib/query-client': { queryClient: { invalidateQueries: ({ predicate }) => {
        state.invalidations++
        assert.equal(predicate({ queryKey: ['transactions', 1] }), true)
        assert.equal(predicate({ queryKey: ['user-profile'] }), false)
        return state.refresh
      } } },
      '../lib/token-storage': { getSessionGeneration: () => state.generation }, '../lib/bookkeeping': helpers,
      '../providers/LedgerProvider': { useLedger: () => ({ generation: 1 }) }, '../theme': { colors: {}, ui: {}, themedStyles: factory => () => factory({}) }, './Screen': {},
    }
    return { state, action: load('src/components/Bookkeeping.tsx', modules).useBookkeepingAction(), ApiError }
  }
  await test('mutations block double taps and navigate before refetch completes', async () => {
    const { state, action } = mutationFixture()
    const write = deferred()
    const refresh = deferred()
    state.refresh = refresh.promise
    let operations = 0
    let successes = 0
    const pending = action.run(async () => { operations++; return write.promise }, () => successes++)
    await action.run(async () => { operations++ })
    assert.equal(operations, 1)
    write.resolve({ id: 'saved' })
    for (let index = 0; index < 5; index++) await Promise.resolve()
    assert.equal(successes, 1)
    assert.equal(state.invalidations, 1)
    refresh.resolve()
    await pending
    assert.equal(state.values.at(-1), false)
  })
  for (const reason of ['logout', 'unmount']) {
    await test(`late mutation ignored after ${reason}`, async () => {
      const { state, action } = mutationFixture()
      const write = deferred()
      let success = false
      let receivedSignal
      const pending = action.run(signal => { receivedSignal = signal; return write.promise }, () => { success = true })
      if (reason === 'logout') state.generation++
      else state.cleanup()
      write.resolve({ id: 'saved' })
      await pending
      assert.equal(success, false)
      assert.equal(state.invalidations, 0)
      if (reason === 'unmount') assert.equal(receivedSignal.aborted, true)
    })
  }
  await test('uncertain network write prompts refresh instead of automatic resubmission', async () => {
    const { state, action, ApiError } = mutationFixture()
    await action.run(async () => { throw new ApiError('network unavailable', 0) })
    assert.ok(state.values.some(value => typeof value === 'string' && value.includes('避免重复提交')))
    assert.equal(state.invalidations, 0)
    assert.equal(state.values.at(-1), false)
  })
  console.log(`\n${passed} bookkeeping runtime checks passed. No live API, database, or type checks were used.`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
