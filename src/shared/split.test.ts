import { describe, expect, it } from 'vitest'
import {
  allocateProportional,
  computeShareAmounts,
  computeSplit,
  splitEqual,
  splitExact,
  splitPercent,
  SplitError,
} from './split'

const total = (a: Record<string, number>) => Object.values(a).reduce((s, v) => s + v, 0)

describe('splitEqual', () => {
  it('splits $100 three ways as 33.34 / 33.33 / 33.33', () => {
    const r = splitEqual(10000, ['carol', 'alice', 'bob'])
    expect(r).toEqual({ alice: 3334, bob: 3333, carol: 3333 })
    expect(total(r)).toBe(10000)
  })
  it('gives leftover cents to the first N uids in sorted order', () => {
    expect(splitEqual(1001, ['d', 'c', 'b', 'a'])).toEqual({ a: 251, b: 250, c: 250, d: 250 })
    expect(splitEqual(1003, ['d', 'c', 'b', 'a'])).toEqual({ a: 251, b: 251, c: 251, d: 250 })
  })
  it('is order independent and dedupes', () => {
    expect(splitEqual(100, ['b', 'a', 'b'])).toEqual(splitEqual(100, ['a', 'b']))
  })
  it('handles zero, one person and refunds', () => {
    expect(splitEqual(0, ['a', 'b'])).toEqual({ a: 0, b: 0 })
    expect(splitEqual(999, ['a'])).toEqual({ a: 999 })
    expect(splitEqual(-100, ['a', 'b', 'c'])).toEqual({ a: -34, b: -33, c: -33 })
  })
  it('requires participants and integer totals', () => {
    expect(() => splitEqual(100, [])).toThrow(SplitError)
    expect(() => splitEqual(10.5, ['a'])).toThrow()
  })
})

describe('splitExact', () => {
  it('accepts amounts summing to the total', () => {
    expect(splitExact(1000, { a: 600, b: 400 })).toEqual({ a: 600, b: 400 })
  })
  it('rejects mismatched sums and negatives', () => {
    expect(() => splitExact(1000, { a: 600, b: 399 })).toThrow(/add up/)
    expect(() => splitExact(1000, { a: 1100, b: -100 })).toThrow(SplitError)
  })
})

describe('splitPercent', () => {
  it('requires percentages to sum to exactly 100%', () => {
    expect(() => splitPercent(1000, { a: 5000, b: 4999 })).toThrow(/100%/)
    expect(() => splitPercent(1000, { a: 5000, b: 5001 })).toThrow(/100%/)
  })
  it('splits by percent with largest remainder rounding', () => {
    // 33.33 / 33.33 / 33.34 of $100
    const r = splitPercent(10000, { a: 3333, b: 3333, c: 3334 })
    expect(r).toEqual({ a: 3333, b: 3333, c: 3334 })
    expect(total(r)).toBe(10000)
  })
  it('always sums exactly to the total', () => {
    const r = splitPercent(9999, { a: 2500, b: 2500, c: 5000 })
    expect(total(r)).toBe(9999)
    // floors are 2499 / 2499 / 4999; the 2 leftover cents go to the largest remainders (a, b)
    expect(r).toEqual({ a: 2500, b: 2500, c: 4999 })
  })
  it('allows 0% participants', () => {
    expect(splitPercent(1000, { a: 10000, b: 0 })).toEqual({ a: 1000, b: 0 })
  })
})

describe('allocateProportional', () => {
  it('breaks remainder ties by uid', () => {
    expect(allocateProportional(2, { b: 1, a: 1, c: 1 })).toEqual({ a: 1, b: 1, c: 0 })
  })
  it('stays exact for large amounts', () => {
    const r = allocateProportional(9_007_199_254_740, { a: 1, b: 2, c: 3 })
    expect(total(r)).toBe(9_007_199_254_740)
  })
  it('never gives units to zero-weight members', () => {
    expect(allocateProportional(5, { a: 0, b: 1, c: 1 })).toEqual({ a: 0, b: 3, c: 2 })
  })
})

describe('computeSplit', () => {
  it('only uses split values for listed participants', () => {
    expect(
      computeSplit({ amountMinor: 1000, splitMethod: 'exact', participantIds: ['a', 'b'], splitValues: { a: 700, b: 300, z: 5 } }),
    ).toEqual({ a: 700, b: 300 })
  })
  it('treats missing values as zero', () => {
    expect(() =>
      computeSplit({ amountMinor: 1000, splitMethod: 'percent', participantIds: ['a', 'b'], splitValues: { a: 10000 } }),
    ).not.toThrow()
  })
})

describe('computeShareAmounts (multi currency)', () => {
  it('copies amounts when currency matches base', () => {
    const r = computeShareAmounts({ amountMinor: 10000, amountBaseMinor: 10000, splitMethod: 'equal', participantIds: ['a', 'b', 'c'] })
    expect(r.a).toEqual({ amountMinor: 3334, amountBaseMinor: 3334 })
  })
  it('allocates base total so base shares sum exactly', () => {
    // 1000.00 CNY → 213.47 AUD split 3 ways
    const r = computeShareAmounts({ amountMinor: 100000, amountBaseMinor: 21347, splitMethod: 'equal', participantIds: ['a', 'b', 'c'] })
    expect(r.a!.amountMinor + r.b!.amountMinor + r.c!.amountMinor).toBe(100000)
    expect(r.a!.amountBaseMinor + r.b!.amountBaseMinor + r.c!.amountBaseMinor).toBe(21347)
    expect(r).toMatchObject({ a: { amountBaseMinor: 7116 }, b: { amountBaseMinor: 7116 }, c: { amountBaseMinor: 7115 } })
  })
  it('works for JPY → AUD with exact splits', () => {
    const r = computeShareAmounts({
      amountMinor: 12000,
      amountBaseMinor: 12240,
      splitMethod: 'exact',
      participantIds: ['a', 'b'],
      splitValues: { a: 9000, b: 3000 },
    })
    expect(r).toEqual({ a: { amountMinor: 9000, amountBaseMinor: 9180 }, b: { amountMinor: 3000, amountBaseMinor: 3060 } })
  })
})
