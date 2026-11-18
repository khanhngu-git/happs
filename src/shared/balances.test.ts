import { describe, expect, it } from 'vitest'
import { hasOutstanding, mySummary, pairwiseDebts, type BalanceShare } from './balances'
import { splitEqual } from './split'

let n = 0
const s = (debtorUid: string, payerUid: string, amountBaseMinor: number, status: BalanceShare['status'] = 'unpaid'): BalanceShare => ({
  id: `s${n++}`,
  debtorUid,
  payerUid,
  amountBaseMinor,
  status,
  expenseId: 'e1',
})

describe('balances', () => {
  it('$100 dinner paid by alice, split 3 ways', () => {
    const split = splitEqual(10000, ['alice', 'bob', 'carol'])
    const shares = Object.entries(split).map(([uid, amt]) => s(uid, 'alice', amt, uid === 'alice' ? 'confirmed' : 'unpaid'))
    expect(mySummary(shares, 'alice')).toMatchObject({ youOweMinor: 0, youAreOwedMinor: 6666, netMinor: 6666 })
    expect(mySummary(shares, 'bob')).toMatchObject({ youOweMinor: 3333, youAreOwedMinor: 0, netMinor: -3333 })
    const pairs = pairwiseDebts(shares)
    expect(pairs).toHaveLength(2)
    expect(pairs.map((p) => [p.fromUid, p.toUid, p.totalMinor])).toEqual([
      ['bob', 'alice', 3333],
      ['carol', 'alice', 3333],
    ])
  })
  it('only confirmed counts as paid; sent is awaiting', () => {
    const shares = [s('bob', 'alice', 1000, 'sent'), s('bob', 'alice', 500, 'unpaid'), s('bob', 'alice', 200, 'confirmed')]
    const bob = mySummary(shares, 'bob')
    expect(bob.youOweMinor).toBe(1500)
    expect(bob.awaitingTheirConfirmationMinor).toBe(1000)
    expect(mySummary(shares, 'alice').awaitingYourConfirmationMinor).toBe(1000)
    expect(pairwiseDebts(shares)[0]).toMatchObject({ totalMinor: 1500, awaitingMinor: 1000 })
  })
  it('keeps both directions separately', () => {
    const shares = [s('bob', 'alice', 1000), s('alice', 'bob', 400)]
    const me = mySummary(shares, 'alice')
    expect(me).toMatchObject({ youOweMinor: 400, youAreOwedMinor: 1000, netMinor: 600 })
    expect(pairwiseDebts(shares)).toHaveLength(2)
  })
  it('disputed shares are still owed', () => {
    expect(mySummary([s('bob', 'alice', 700, 'disputed')], 'bob').youOweMinor).toBe(700)
  })
  it('detects outstanding balances', () => {
    expect(hasOutstanding([s('bob', 'alice', 1, 'confirmed')], 'bob')).toBe(false)
    expect(hasOutstanding([s('bob', 'alice', 1, 'sent')], 'alice')).toBe(true)
    expect(hasOutstanding([s('bob', 'alice', 1)], 'carol')).toBe(false)
  })
})
