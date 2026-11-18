import { describe, expect, it } from 'vitest'
import { allowedActions, nextStatus, type ShareStatus } from './shareState'

const share = (status: ShareStatus) => ({ debtorUid: 'sam', payerUid: 'alex', status })

describe('share state machine', () => {
  it('debtor can mark unpaid or disputed shares as sent', () => {
    expect(nextStatus(share('unpaid'), 'sam', 'markSent')).toBe('sent')
    expect(nextStatus(share('disputed'), 'sam', 'markSent')).toBe('sent')
    expect(nextStatus(share('sent'), 'sam', 'markSent')).toBeNull()
    expect(nextStatus(share('confirmed'), 'sam', 'markSent')).toBeNull()
  })
  it('payer confirms or disputes sent shares', () => {
    expect(nextStatus(share('sent'), 'alex', 'confirm')).toBe('confirmed')
    expect(nextStatus(share('sent'), 'alex', 'dispute')).toBe('disputed')
    expect(nextStatus(share('unpaid'), 'alex', 'confirm')).toBeNull()
    expect(nextStatus(share('disputed'), 'alex', 'dispute')).toBeNull()
  })
  it('payer can mark unpaid as received (cash)', () => {
    expect(nextStatus(share('unpaid'), 'alex', 'markReceived')).toBe('confirmed')
    expect(nextStatus(share('sent'), 'alex', 'markReceived')).toBeNull()
  })
  it('roles cannot be swapped and third parties can do nothing', () => {
    expect(nextStatus(share('unpaid'), 'alex', 'markSent')).toBeNull()
    expect(nextStatus(share('sent'), 'sam', 'confirm')).toBeNull()
    expect(allowedActions(share('sent'), 'zoe')).toEqual([])
  })
  it('payer-own shares never transition', () => {
    expect(allowedActions({ debtorUid: 'alex', payerUid: 'alex', status: 'confirmed' }, 'alex')).toEqual([])
  })
  it('lists allowed actions', () => {
    expect(allowedActions(share('unpaid'), 'sam')).toEqual(['markSent'])
    expect(allowedActions(share('unpaid'), 'alex')).toEqual(['markReceived'])
    expect(allowedActions(share('sent'), 'alex')).toEqual(['confirm', 'dispute'])
  })
})
