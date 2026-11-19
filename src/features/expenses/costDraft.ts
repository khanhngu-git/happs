/**
 * Editable money state shared by the item cost section and the expense form.
 * Inputs are kept as strings while typing and converted to integer minor
 * units (or basis points) only on validation.
 */
import { formatMoney, minorToInputString, parseDecimalToMinor, parseToMinor } from '@/shared/money'
import { computeSplit, FULL_PERCENT_BPS, SplitError, type Allocation, type SplitMethod } from '@/shared/split'
import type { ItemCost } from './expenseApi'

export interface CostDraft {
  amount: string
  currency: string
  fxRate: string
  paidBy: string
  splitMethod: SplitMethod
  participantIds: string[]
  /** exact: money strings; percent: percent strings like "33.33". */
  values: Record<string, string>
}

export function emptyDraft(opts: { currency: string; paidBy: string; memberIds: string[] }): CostDraft {
  return { amount: '', currency: opts.currency, fxRate: '1', paidBy: opts.paidBy, splitMethod: 'equal', participantIds: [...opts.memberIds], values: {} }
}

export function draftFromCost(cost: ItemCost): CostDraft {
  const values: Record<string, string> = {}
  for (const [uid, v] of Object.entries(cost.splitValues ?? {})) {
    values[uid] = cost.splitMethod === 'percent' ? (v / 100).toString() : minorToInputString(v, cost.currency)
  }
  return {
    amount: minorToInputString(cost.amountMinor, cost.currency),
    currency: cost.currency,
    fxRate: String(cost.fxRateToBase),
    paidBy: cost.paidBy,
    splitMethod: cost.splitMethod,
    participantIds: [...cost.participantIds],
    values,
  }
}

export type DraftResult = { ok: true; cost: ItemCost; allocation: Allocation } | { ok: false; error: string }

export function validateDraft(d: CostDraft, baseCurrency: string): DraftResult {
  const amountMinor = parseToMinor(d.amount, d.currency)
  if (amountMinor === null || amountMinor < 0) return { ok: false, error: 'Enter a valid amount' }
  if (amountMinor === 0) return { ok: false, error: 'Enter an amount above zero' }
  const fx = d.currency === baseCurrency ? 1 : Number(d.fxRate)
  if (!(fx > 0) || !Number.isFinite(fx)) return { ok: false, error: `Enter the exchange rate to ${baseCurrency}` }
  if (d.participantIds.length === 0) return { ok: false, error: 'Pick at least one person to split with' }

  let splitValues: Allocation | null = null
  if (d.splitMethod !== 'equal') {
    splitValues = {}
    for (const uid of d.participantIds) {
      const raw = (d.values[uid] ?? '').trim() || '0'
      const v = d.splitMethod === 'percent' ? parseDecimalToMinor(raw, 2) : parseToMinor(raw, d.currency)
      if (v === null || v < 0) return { ok: false, error: d.splitMethod === 'percent' ? 'Percentages must be numbers like 33.33' : 'Enter valid amounts for everyone' }
      splitValues[uid] = v
    }
  }
  const cost: ItemCost = { amountMinor, currency: d.currency, fxRateToBase: fx, paidBy: d.paidBy, splitMethod: d.splitMethod, participantIds: d.participantIds, splitValues }
  try {
    return { ok: true, cost, allocation: computeSplit(cost) }
  } catch (err) {
    if (err instanceof SplitError) {
      // Show money, not minor units ("A$800.00 of A$900.00", not "80000 / 90000").
      if (err.mismatch) {
        const { sum, total } = err.mismatch
        const diff = formatMoney(Math.abs(total - sum), d.currency)
        return { ok: false, error: `The amounts add up to ${formatMoney(sum, d.currency)}, not ${formatMoney(total, d.currency)} (${diff} ${sum < total ? 'still to assign' : 'too much'})` }
      }
      return { ok: false, error: err.message }
    }
    throw err
  }
}

/** Remaining amount (exact) or percent (percent) still to assign, for the helper line. */
export function remaining(d: CostDraft): { label: string; done: boolean } | null {
  if (d.splitMethod === 'equal') return null
  if (d.splitMethod === 'percent') {
    const sum = d.participantIds.reduce((s, u) => s + (parseDecimalToMinor((d.values[u] ?? '') || '0', 2) ?? 0), 0)
    const left = FULL_PERCENT_BPS - sum
    return { label: left === 0 ? 'Adds up to 100%' : `${(left / 100).toFixed(2)}% ${left > 0 ? 'left to assign' : 'too much'}`, done: left === 0 }
  }
  const total = parseToMinor(d.amount, d.currency) ?? 0
  const sum = d.participantIds.reduce((s, u) => s + (parseToMinor((d.values[u] ?? '') || '0', d.currency) ?? 0), 0)
  const left = total - sum
  return { label: left === 0 ? 'Adds up to the total' : `${minorToInputString(Math.abs(left), d.currency)} ${left > 0 ? 'left to assign' : 'too much'}`, done: left === 0 }
}
