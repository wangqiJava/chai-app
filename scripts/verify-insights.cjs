const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
let passed = 0
function load(relative, modules = {}) {
  const file = path.join(root, relative)
  // Runtime transpilation only; no type checking, network calls, or generated files.
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`)
    return modules[name]
  } }, { filename: relative })
  return exports
}
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`) }
const plain = value => JSON.parse(JSON.stringify(value))

async function main() {
  const bookkeeping = load('src/lib/bookkeeping.ts')
  const helper = load('src/lib/insights.ts', { './bookkeeping': bookkeeping })
  for (const value of ['0.00', '0.01', '1.20', '-12.34', '99999999999999.99', '-99999999999999.99']) {
    await test(`exact cents round trip ${value}`, () => assert.equal(helper.moneyFromCents(helper.cents(value)), value))
  }
  for (const value of ['', 'NaN', 'Infinity', '1.005', '1e3', '1,000']) {
    await test(`reject invalid money ${value}`, () => assert.throws(() => helper.cents(value)))
  }
  await test('average rounds at cent boundary', () => {
    assert.equal(helper.averageMoney('0.01', 2), '0.01')
    assert.equal(helper.averageMoney('-0.01', 2), '-0.01')
    assert.equal(helper.averageMoney('1.00', 3), '0.33')
    assert.equal(helper.averageMoney('99999999999999.99', 1), '99999999999999.99')
    assert.equal(helper.averageMoney('1.00', 0), '0.00')
  })
  await test('month lengths and year rollover', () => {
    assert.equal(helper.monthDays('2024-02'), 29)
    assert.equal(helper.monthDays('1900-02'), 28)
    assert.equal(helper.monthDays('2026-04'), 30)
    assert.equal(helper.previousMonth('2026-01'), '2025-12')
  })
  const now = new Date(2026, 9, 13)
  await test('daily average matches elapsed days for current month', () => {
    assert.equal(helper.averageDays('2026-10', now), 13)
    assert.equal(helper.averageDays('2026-09', now), 30)
    assert.equal(helper.averageDays('2026-11', now), 30)
  })
  await test('remaining days past, present, future and last day', () => {
    assert.equal(helper.remainingDays('2026-09', now), 0)
    assert.equal(helper.remainingDays('2026-10', now), 19)
    assert.equal(helper.remainingDays('2026-11', now), 30)
    assert.equal(helper.remainingDays('2026-10', new Date(2026, 9, 31)), 1)
  })
  for (const [start, end, valid] of [
    ['2024-02-29', '2024-02-29', true], ['2026-01-01', '2026-12-31', true],
    ['2026-10-14', '2026-10-13', false], ['2026-02-29', '2026-03-01', false],
    ['', '2026-01-01', false], ['2026-13-01', '2026-13-02', false],
  ]) await test(`range ${start} to ${end}`, () => assert.equal(helper.validRange(start, end), valid))
  await test('month comparison handles zero and signs', () => {
    assert.equal(helper.changePercent('1.00', '0.00'), null)
    assert.equal(helper.changePercent('0.00', '1.00'), '-100.0%')
    assert.equal(helper.changePercent('1.00', '1.00'), '0.0%')
    assert.equal(helper.changePercent('1.01', '1.00'), '+1.0%')
    assert.equal(helper.changePercent('4.00', '3.00'), '+33.3%')
    assert.equal(helper.changePercent('99999999999999.99', '0.01'), '+999999999999999800.0%')
  })
  await test('budget warning threshold and exact boundary', () => {
    assert.equal(helper.budgetProgress('100.00', '89.99').warning, false)
    assert.equal(helper.budgetProgress('100.00', '90.00').warning, true)
    assert.equal(helper.budgetProgress('100.00', '100.00').over, false)
    assert.equal(helper.budgetProgress('100.00', '100.01').over, true)
  })
  await test('overspending retains true ratio but caps visual progress', () => {
    assert.deepEqual(plain(helper.budgetProgress('100.00', '125.00')), { percent: 100, label: '125.0%', over: true, warning: true })
    assert.equal(helper.budgetProgress('0.00', '0.00').percent, 0)
  })
  await test('donut keeps all categories and closes the full circle', () => {
    const parts = helper.chartParts(Array(9).fill('10.00'))
    assert.equal(parts.length, 9)
    assert.ok(Math.abs(parts.at(-1).start + parts.at(-1).fraction - 1) < 1e-10)
    assert.ok(parts.every(part => part.fraction > 0))
  })
  await test('empty and zero charts remain finite', () => {
    assert.equal(helper.chartParts([]).length, 0)
    assert.ok(helper.chartParts(['0.00', '0.00']).every(part => part.fraction === 0 && part.start === 0))
    assert.equal(helper.chartParts(['100.00'])[0].fraction, 1)
  })

  const calls = []
  const modules = { '../lib/http': { request: async (url, options) => { calls.push({ url, options }); return { id: 'mock' } } } }
  const stats = load('src/api/stats.ts', modules)
  const budgets = load('src/api/budgets.ts', modules)
  const signal = new AbortController().signal
  const input = { ledgerId: 'ledger', month: '2026-09', amount: '123.45', categoryId: 'category' }
  const contracts = [
    [() => stats.getMonthlySummary('ledger', '2026-09', signal), '/stats/summary', 'GET', { ledgerId: 'ledger', month: '2026-09' }],
    [() => stats.getCategoryRatio('ledger', '2026-09', 'INCOME', signal), '/stats/category', 'GET', { ledgerId: 'ledger', month: '2026-09', type: 'INCOME' }],
    [() => stats.getTrend('ledger', signal), '/stats/trend', 'GET', { ledgerId: 'ledger' }],
    [() => stats.getCalendar('ledger', '2026-09', signal), '/stats/calendar', 'GET', { ledgerId: 'ledger', month: '2026-09' }],
    [() => stats.getRangeSummary('ledger', '2026-01-01', '2026-12-31', signal), '/stats/custom', 'GET', { ledgerId: 'ledger', startDate: '2026-01-01', endDate: '2026-12-31' }],
    [() => budgets.getBudgets('ledger', '2026-09', signal), '/budgets', 'GET', { ledgerId: 'ledger', month: '2026-09' }],
    [() => budgets.createBudget(input, signal), '/budgets', 'POST', undefined, input],
    [() => budgets.updateBudget('id/1', '99999999999999.99', signal), '/budgets/id%2F1', 'PUT', undefined, { amount: '99999999999999.99' }],
    [() => budgets.deleteBudget('id/1', signal), '/budgets/id%2F1', 'DELETE'],
  ]
  for (const [call, url, method, query, body] of contracts) {
    await test(`${method} ${url} contract and cancellation`, async () => {
      await call()
      const actual = calls.at(-1)
      assert.equal(actual.url, url)
      assert.equal(actual.options.method || 'GET', method)
      assert.equal(actual.options.signal, signal)
      assert.notEqual(actual.options.auth, false)
      assert.deepEqual(actual.options.query && plain(actual.options.query), query)
      assert.deepEqual(actual.options.body && plain(actual.options.body), body)
    })
  }
  console.log(`\n${passed} insight checks passed (runtime only, no TypeScript type checking).`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
