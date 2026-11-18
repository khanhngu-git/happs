/**
 * Balance maths over shares. Only `confirmed` shares count as paid; `sent`
 * shares are still owed but reported separately as "awaiting confirmation".
 * Pairs are not netted against each other: "You owe Alex" and "Alex owes you"
 * are shown separately so "Settle all with Alex" maps 1:1 onto real shares.
 */
import { isOutstanding, type ShareStatus } from './shareState'

export interface BalanceShare {
  id: string
  debtorUid: string
  payerUid: string
  amountBaseMinor: number
  status: ShareStatus
  expenseId: string
}

export interface PairDebt {
  fromUid: string
  toUid: string
  /** Everything not yet confirmed (unpaid + sent + disputed). */
  totalMinor: number
  /** The part of totalMinor already marked as sent. */
  awaitingMinor: number
  shares: BalanceShare[]
}

export interface MySummary {
  youOweMinor: number
  youAreOwedMinor: number
  netMinor: number
  awaitingYourConfirmationMinor: number
  awaitingTheirConfirmationMinor: number
}

export function pairwiseDebts(shares: BalanceShare[]): PairDebt[] {
  const map = new Map<string, PairDebt>()
  for (const s of shares) {
    if (!isOutstanding(s)) continue
    const key = `${s.debtorUid}→${s.payerUid}`
    let pair = map.get(key)
    if (!pair) {
      pair = { fromUid: s.debtorUid, toUid: s.payerUid, totalMinor: 0, awaitingMinor: 0, shares: [] }
      map.set(key, pair)
    }
    pair.totalMinor += s.amountBaseMinor
    if (s.status === 'sent') pair.awaitingMinor += s.amountBaseMinor
    pair.shares.push(s)
  }
  return [...map.values()].sort((a, b) => b.totalMinor - a.totalMinor || a.fromUid.localeCompare(b.fromUid))
}

export function mySummary(shares: BalanceShare[], me: string): MySummary {
  const out: MySummary = {
    youOweMinor: 0,
    youAreOwedMinor: 0,
    netMinor: 0,
    awaitingYourConfirmationMinor: 0,
    awaitingTheirConfirmationMinor: 0,
  }
  for (const s of shares) {
    if (!isOutstanding(s)) continue
    if (s.debtorUid === me) {
      out.youOweMinor += s.amountBaseMinor
      if (s.status === 'sent') out.awaitingTheirConfirmationMinor += s.amountBaseMinor
    } else if (s.payerUid === me) {
      out.youAreOwedMinor += s.amountBaseMinor
      if (s.status === 'sent') out.awaitingYourConfirmationMinor += s.amountBaseMinor
    }
  }
  out.netMinor = out.youAreOwedMinor - out.youOweMinor
  return out
}

/** Does this user have any shares that are not yet confirmed (either side)? */
export function hasOutstanding(shares: BalanceShare[], uid: string): boolean {
  return shares.some((s) => isOutstanding(s) && (s.debtorUid === uid || s.payerUid === uid))
}
