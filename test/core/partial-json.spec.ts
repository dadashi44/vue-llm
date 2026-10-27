import { describe, it, expect } from 'vitest'
import { parsePartialJSON } from '../../src/core/partial-json'

describe('parsePartialJSON', () => {
  it.each([
    ['', undefined],
    ['{', {}],
    ['{"city":"Os', { city: 'Os' }],
    ['{"city":"Oslo"', { city: 'Oslo' }],
    ['{"city":"Oslo",', { city: 'Oslo' }],
    ['{"city":"Oslo","da', { city: 'Oslo' }],
    ['{"city":"Oslo","days":', { city: 'Oslo' }],
    ['{"city":"Oslo","days":3', { city: 'Oslo', days: 3 }],
    ['{"ok":tr', {}],
    ['{"ok":true,"n":nul', { ok: true }],
    ['{"items":[{"n":"a"},{"n', { items: [{ n: 'a' }, {}] }],
    ['{"items":[1,2,', { items: [1, 2] }],
    ['{"items":["a","b', { items: ['a', 'b'] }],
    ['[{"a":{"b":[1', [{ a: { b: [1] } }]],
    ['{"q":"say \\"hi', { q: 'say "hi' }],
    ['{"q":"line\\', { q: 'line' }],
    ['{"q":"snow \\u26', { q: 'snow ' }],
    ['{"a":1}', { a: 1 }],
    ['"just a str', 'just a str'],
  ])('%s', (input, expected) => {
    expect(parsePartialJSON(input)).toEqual(expected)
  })

  it('keeps braces and brackets inside strings', () => {
    expect(parsePartialJSON('{"code":"if (a) { b[0]')).toEqual({ code: 'if (a) { b[0]' })
  })
})
