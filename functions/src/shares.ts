/**
 * Notifications for the payment-confirmation flow.
 *
 * Settle-up batches notify once per batch (onBatchWrite) instead of once per
 * share, so per-share notifications are skipped for shares moved by a batch.
 */
import { onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { db } from './admin'
import { notify } from './notify'
import { memberName } from './util'
import { formatMoney } from '@shared/money'

async function tripInfo(tripId: string) {
  const t = await db.doc(`trips/${tripId}`).get()
  return { name: (t.get('name') as string) ?? 'your trip', base: (t.get('baseCurrency') as string) ?? 'AUD' }
}

const expensesUrl = (tripId: string, refPath?: string) =>
  `/trips/${tripId}/expenses${refPath ? `?share=${encodeURIComponent(refPath)}` : ''}`

export const onShareUpdate = onDocumentUpdated('trips/{tripId}/expenses/{expenseId}/shares/{shareUid}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after || before.status === after.status) return
  const { tripId } = event.params
  const refPath = event.data!.after.ref.path

  // Part of a settle-up batch that is being sent or resolved as a whole: the batch trigger notifies.
  if (after.batchId) {
    const batch = await db.doc(`trips/${tripId}/settlementBatches/${after.batchId}`).get()
    const batchStatus = batch.get('status') as string | undefined
    if (after.status === 'sent' || batchStatus === after.status) return
  }

  const amount = formatMoney(after.amountMinor, after.currency)
  const title = after.expenseTitle || 'an expense'
  const lastNote = ((after.history as { note?: string }[] | undefined)?.at(-1)?.note ?? '').trim()

  if (after.status === 'sent') {
    const debtor = await memberName(tripId, after.debtorUid)
    await notify(after.payerUid, {
      type: 'shareSent',
      tripId,
      refPath,
      title: `${debtor} says they sent you ${amount}`,
      body: `For ${title}. Confirm you received it?`,
      url: expensesUrl(tripId, refPath),
    })
  } else if (after.status === 'confirmed') {
    const payer = await memberName(tripId, after.payerUid)
    await notify(after.debtorUid, {
      type: 'shareConfirmed',
      tripId,
      refPath,
      title: before.status === 'unpaid' ? `${payer} marked ${amount} as received` : `${payer} confirmed your ${amount}`,
      body: `For ${title}. You’re all square on this one.`,
      url: expensesUrl(tripId, refPath),
    })
  } else if (after.status === 'disputed') {
    const payer = await memberName(tripId, after.payerUid)
    await notify(after.debtorUid, {
      type: 'shareDisputed',
      tripId,
      refPath,
      title: `${payer} hasn’t received your ${amount}`,
      body: `For ${title}.${lastNote ? ` “${lastNote}”` : ''} Check the details and send again.`,
      url: expensesUrl(tripId, refPath),
    })
  }
})

export const onBatchWrite = onDocumentWritten('trips/{tripId}/settlementBatches/{batchId}', async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : null
  const after = event.data?.after.exists ? event.data.after.data() : null
  if (!after || before?.status === after.status) return
  const { tripId } = event.params
  const { base } = await tripInfo(tripId)
  const amount = formatMoney(after.totalBaseMinor, base)
  const count = (after.shareRefs as string[]).length
  const refPath = event.data!.after.ref.path
  const what = `${count} expense${count === 1 ? '' : 's'}`

  if (after.status === 'sent') {
    const from = await memberName(tripId, after.fromUid)
    await notify(after.toUid, {
      type: 'shareSent',
      tripId,
      refPath,
      title: `${from} says they sent you ${amount}`,
      body: `To settle up ${what}. Confirm you received it?`,
      url: `/trips/${tripId}/expenses?batch=${event.params.batchId}`,
    })
  } else if (after.status === 'confirmed' || after.status === 'disputed') {
    const to = await memberName(tripId, after.toUid)
    await notify(after.fromUid, {
      type: after.status === 'confirmed' ? 'shareConfirmed' : 'shareDisputed',
      tripId,
      refPath,
      title: after.status === 'confirmed' ? `${to} confirmed your ${amount}` : `${to} hasn’t received your ${amount}`,
      body: after.status === 'confirmed' ? `You’ve settled up ${what}.` : 'Check the details and send again.',
      url: expensesUrl(tripId),
    })
  }
})

/** Daily nudge for payers with payments marked sent more than 48 hours ago. */
export const remindPendingConfirmations = onSchedule({ schedule: 'every day 09:00', timeZone: 'Australia/Sydney' }, async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - 48 * 60 * 60 * 1000)
  const snap = await db.collectionGroup('shares').where('status', '==', 'sent').where('updatedAt', '<', cutoff).get()
  const byPayer = new Map<string, { tripId: string; refPath: string; count: number }>()
  for (const d of snap.docs) {
    const s = d.data()
    const cur = byPayer.get(s.payerUid)
    if (cur) cur.count++
    else byPayer.set(s.payerUid, { tripId: s.tripId, refPath: d.ref.path, count: 1 })
  }
  for (const [payer, { tripId, refPath, count }] of byPayer) {
    await notify(payer, {
      type: 'confirmReminder',
      tripId,
      refPath: count === 1 ? refPath : null,
      title: `${count} payment${count === 1 ? '' : 's'} waiting for you to confirm`,
      body: 'Friends have marked these as paid. A quick tap keeps everyone’s balances right.',
      url: expensesUrl(tripId, count === 1 ? refPath : undefined),
    })
  }
  logger.info(`Sent confirmation reminders to ${byPayer.size} payers`)
})
