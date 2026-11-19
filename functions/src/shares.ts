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
import { addDays, diffDays, formatTime } from '@shared/dates'
import { dayLines, localDateHour } from '@shared/itinerary'
import type { ItemDoc } from '@shared/schemas'

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

/** Trip time zones, read once per run. */
function tripZones() {
  const cache = new Map<string, Promise<string | null>>()
  return (tripId: string) => {
    let z = cache.get(tripId)
    if (!z) {
      z = db.doc(`trips/${tripId}`).get().then((t) => (t.exists ? ((t.get('timeZone') as string) || 'UTC') : null))
      cache.set(tripId, z)
    }
    return z
  }
}

/** The local hour when reminders go out. */
const REMINDER_HOUR = 9

/**
 * Nudge payers about payments marked sent more than 48 hours ago. Runs hourly
 * and sends at 9 am in each trip's own time zone (not 9 am Sydney for everyone).
 */
export const remindPendingConfirmations = onSchedule({ schedule: 'every 60 minutes', timeZone: 'UTC' }, async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - 48 * 60 * 60 * 1000)
  const snap = await db.collectionGroup('shares').where('status', '==', 'sent').where('updatedAt', '<', cutoff).get()
  const zoneOf = tripZones()
  const groups = new Map<string, { payer: string; tripId: string; refPath: string; count: number }>()
  for (const d of snap.docs) {
    const s = d.data()
    const zone = await zoneOf(s.tripId)
    if (!zone || localDateHour(zone).hour !== REMINDER_HOUR) continue
    const key = `${s.payerUid}|${s.tripId}`
    const cur = groups.get(key)
    if (cur) cur.count++
    else groups.set(key, { payer: s.payerUid, tripId: s.tripId, refPath: d.ref.path, count: 1 })
  }
  for (const { payer, tripId, refPath, count } of groups.values()) {
    await notify(payer, {
      type: 'confirmReminder',
      tripId,
      refPath: count === 1 ? refPath : null,
      title: `${count} payment${count === 1 ? '' : 's'} waiting for you to confirm`,
      body: 'Friends have marked these as paid. A quick tap keeps everyone’s balances right.',
      url: expensesUrl(tripId, count === 1 ? refPath : undefined),
    })
  }
  logger.info(`Sent ${groups.size} confirmation reminders`)
})

/** The local hour for the evening-before summary. */
const SUMMARY_HOUR = 18

/**
 * Evening before each trip day (6 pm local): what's on tomorrow, so nobody
 * misses an early flight or check-out. Only days with plans, only during or
 * just before the trip.
 */
export const dayBeforeSummary = onSchedule({ schedule: 'every 60 minutes', timeZone: 'UTC' }, async () => {
  const now = new Date()
  // Trips that haven't ended (a day of slack for time zones); start is filtered per trip below.
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)
  const trips = await db.collection('trips').where('endDate', '>=', yesterday).get()
  let sent = 0
  for (const t of trips.docs) {
    const trip = t.data()
    const local = localDateHour(trip.timeZone || 'UTC', now)
    if (local.hour !== SUMMARY_HOUR) continue
    const tomorrow = addDays(local.date, 1)
    if (tomorrow < trip.startDate || tomorrow > trip.endDate) continue
    const items = (await t.ref.collection('items').get()).docs.map((d) => ({ id: d.id, ...(d.data() as ItemDoc) }))
    const lines = dayLines(items, tomorrow, formatTime)
    if (lines.length === 0) continue
    const dayNo = diffDays(tomorrow, trip.startDate) + 1
    await Promise.all(
      (trip.memberIds as string[]).map((uid) =>
        notify(uid, {
          type: 'tripTomorrow',
          tripId: t.id,
          refPath: null,
          title: dayNo === 1 ? `${trip.name} starts tomorrow` : `Tomorrow in ${trip.name} (day ${dayNo})`,
          body: lines.join(' · '),
          url: `/trips/${t.id}/itinerary?day=${tomorrow}`,
        }),
      ),
    )
    sent++
  }
  logger.info(`Sent day-before summaries for ${sent} trips`)
})
