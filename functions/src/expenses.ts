/**
 * onExpenseWrite: (re)generates an expense's shares whenever its amount,
 * currency, payer, split or participants change, and keeps amountBaseMinor
 * consistent with the captured FX rate.
 *
 * Regeneration only happens while every non-payer share is still `unpaid`;
 * once money has moved, shares are frozen (the client warns before editing).
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { db } from './admin'
import { convertMinor, formatMoney } from '@shared/money'
import { notify } from './notify'
import { memberName } from './util'
import { computeShareAmounts, SplitError } from '@shared/split'
import { expenseSchema } from '@shared/schemas'

export const onExpenseWrite = onDocumentWritten('trips/{tripId}/expenses/{expenseId}', async (event) => {
  const { tripId, expenseId } = event.params
  const after = event.data?.after
  const sharesCol = db.collection(`trips/${tripId}/expenses/${expenseId}/shares`)

  if (!after?.exists) {
    // Expense deleted: remove its shares.
    await db.recursiveDelete(sharesCol)
    return
  }

  const parsed = expenseSchema.safeParse(after.data())
  if (!parsed.success) {
    logger.error(`Invalid expense ${after.ref.path}`, parsed.error.issues)
    return
  }
  const exp = parsed.data
  const trip = await db.doc(`trips/${tripId}`).get()
  if (!trip.exists) return
  const base = trip.get('baseCurrency') as string

  // 1. Keep the base-currency total authoritative.
  const expectedBase = convertMinor(exp.amountMinor, exp.currency, base, exp.currency === base ? 1 : exp.fxRateToBase)
  if (exp.amountBaseMinor !== expectedBase) {
    // This write re-triggers the function, which then generates shares.
    await after.ref.update({ amountBaseMinor: expectedBase })
    return
  }

  // 2. Work out the desired shares.
  let amounts
  try {
    amounts = computeShareAmounts({ ...exp, amountBaseMinor: expectedBase })
  } catch (err) {
    if (err instanceof SplitError) {
      logger.warn(`Expense ${after.ref.path} has an invalid split: ${err.message}`)
      return
    }
    throw err
  }

  const existing = await sharesCol.get()
  const existingById = new Map(existing.docs.map((d) => [d.id, d.data()]))

  const same =
    existing.size === Object.keys(amounts).length &&
    Object.entries(amounts).every(([uid, a]) => {
      const s = existingById.get(uid)
      return s && s.payerUid === exp.paidBy && s.amountMinor === a.amountMinor && s.amountBaseMinor === a.amountBaseMinor && s.currency === exp.currency
    })

  if (same) {
    // Only the title (or other metadata) changed: keep denormalised title in sync.
    const stale = existing.docs.filter((d) => d.get('expenseTitle') !== exp.title)
    if (stale.length) {
      const batch = db.batch()
      stale.forEach((d) => batch.update(d.ref, { expenseTitle: exp.title }))
      await batch.commit()
    }
    return
  }

  const locked = existing.docs.some((d) => {
    const s = d.data()
    return s.debtorUid !== s.payerUid && s.status !== 'unpaid'
  })
  if (locked) {
    logger.warn(`Not regenerating shares for ${after.ref.path}: some shares are already sent or confirmed.`)
    return
  }

  // 3. Replace shares atomically.
  const batch = db.batch()
  const now = Timestamp.now()
  for (const d of existing.docs) if (!(d.id in amounts)) batch.delete(d.ref)
  for (const [uid, a] of Object.entries(amounts)) {
    const isPayer = uid === exp.paidBy
    batch.set(sharesCol.doc(uid), {
      tripId,
      expenseId,
      expenseTitle: exp.title,
      currency: exp.currency,
      debtorUid: uid,
      payerUid: exp.paidBy,
      amountMinor: a.amountMinor,
      amountBaseMinor: a.amountBaseMinor,
      // The payer doesn't owe themselves.
      status: isPayer ? 'confirmed' : 'unpaid',
      method: null,
      reference: '',
      note: '',
      batchId: null,
      history: [{ status: isPayer ? 'confirmed' : 'unpaid', byUid: 'system', at: now, note: isPayer ? 'Paid the bill' : '' }],
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
  await batch.commit()

  // A brand-new cost: tell everyone who now owes something (not whoever added it).
  if (existing.size === 0) {
    const creator = exp.createdBy
    const [creatorName, payerName] = await Promise.all([memberName(tripId, creator), memberName(tripId, exp.paidBy)])
    const tripName = trip.get('name') as string
    await Promise.all(
      Object.entries(amounts)
        .filter(([uid]) => uid !== exp.paidBy && uid !== creator)
        .map(([uid, a]) =>
          notify(uid, {
            type: 'expenseAdded',
            tripId,
            refPath: `trips/${tripId}/expenses/${expenseId}/shares/${uid}`,
            title: `${creatorName} added ${exp.title}`,
            body: `You owe ${exp.paidBy === creator ? creatorName : payerName} ${formatMoney(a.amountBaseMinor, base)} · ${tripName}`,
            url: `/trips/${tripId}/expenses?expense=${expenseId}`,
          }),
        ),
    )
  }
})
