/**
 * Share payment-confirmation state machine. This mirrors firestore.rules
 * exactly; the rules are the enforcement, this module drives the UI and the
 * Cloud Functions so they never offer a transition the rules would reject.
 *
 *   unpaid ──(debtor: markSent)──▶ sent ──(payer: confirm)──▶ confirmed
 *                                   │
 *                                   └──(payer: dispute)──▶ disputed ──(debtor: markSent)──▶ sent
 *   unpaid ──(payer: markReceived, e.g. cash)──▶ confirmed
 */

export type ShareStatus = 'unpaid' | 'sent' | 'confirmed' | 'disputed'
export type ShareAction = 'markSent' | 'confirm' | 'dispute' | 'markReceived'
export type PaymentMethod = 'bank' | 'payid' | 'cash' | 'paypal' | 'other'

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'bank', label: 'Bank transfer' },
  { value: 'payid', label: 'PayID' },
  { value: 'cash', label: 'Cash' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'other', label: 'Other' },
]

export const SHARE_STATUS_LABEL: Record<ShareStatus, string> = {
  unpaid: 'Unpaid',
  sent: 'Awaiting confirmation',
  confirmed: 'Paid',
  disputed: 'Not received',
}

interface Transition {
  from: ShareStatus[]
  to: ShareStatus
  actor: 'debtor' | 'payer'
}

export const TRANSITIONS: Record<ShareAction, Transition> = {
  markSent: { from: ['unpaid', 'disputed'], to: 'sent', actor: 'debtor' },
  confirm: { from: ['sent'], to: 'confirmed', actor: 'payer' },
  dispute: { from: ['sent'], to: 'disputed', actor: 'payer' },
  markReceived: { from: ['unpaid'], to: 'confirmed', actor: 'payer' },
}

export interface ShareParties {
  debtorUid: string
  payerUid: string
  status: ShareStatus
}

/** Returns the resulting status, or null if `actorUid` may not perform `action`. */
export function nextStatus(share: ShareParties, actorUid: string, action: ShareAction): ShareStatus | null {
  // The payer's own share is auto-confirmed and never transitions.
  if (share.debtorUid === share.payerUid) return null
  const t = TRANSITIONS[action]
  const actorOk = t.actor === 'debtor' ? share.debtorUid === actorUid : share.payerUid === actorUid
  if (!actorOk || !t.from.includes(share.status)) return null
  return t.to
}

export function allowedActions(share: ShareParties, actorUid: string): ShareAction[] {
  return (Object.keys(TRANSITIONS) as ShareAction[]).filter((a) => nextStatus(share, actorUid, a) !== null)
}

export function isOutstanding(share: ShareParties): boolean {
  return share.debtorUid !== share.payerUid && share.status !== 'confirmed'
}
