/**
 * Splitting logic shared by the client (previews) and Cloud Functions (the
 * authoritative share generation). Every function is pure and deterministic:
 * the same input always yields the same per-person integer amounts, and the
 * parts always sum exactly to the total.
 */
import { assertMinor } from './money'

export type SplitMethod = 'equal' | 'exact' | 'percent'
export type Allocation = Record<string, number>

export class SplitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SplitError'
  }
}

/** Basis points: 10000 = 100%. Percent splits are stored this way to stay integer. */
export const FULL_PERCENT_BPS = 10_000

function sortedUnique(uids: string[]): string[] {
  return [...new Set(uids)].sort()
}

/**
 * Equal split. Leftover minor units go one each to the first N members in
 * sorted uid order. $100.00 / 3 → 3334, 3333, 3333.
 */
export function splitEqual(totalMinor: number, uids: string[]): Allocation {
  assertMinor(totalMinor, 'total')
  const members = sortedUnique(uids)
  if (members.length === 0) throw new SplitError('Pick at least one person to split with')
  const sign = totalMinor < 0 ? -1 : 1
  const abs = Math.abs(totalMinor)
  const base = Math.floor(abs / members.length)
  let remainder = abs - base * members.length
  const out: Allocation = {}
  for (const uid of members) {
    const extra = remainder > 0 ? 1 : 0
    remainder -= extra
    out[uid] = sign * (base + extra)
  }
  return out
}

/**
 * Proportional allocation with the largest-remainder method. Each person gets
 * floor(total * w / sum(w)); leftover units go to the largest fractional
 * remainders, ties broken by sorted uid. Used for percent splits and for
 * converting per-person amounts into the trip's base currency.
 */
export function allocateProportional(totalMinor: number, weights: Allocation): Allocation {
  assertMinor(totalMinor, 'total')
  const uids = Object.keys(weights).sort()
  if (uids.length === 0) throw new SplitError('Nothing to allocate between')
  let weightSum = 0
  for (const uid of uids) {
    const w = weights[uid]!
    if (!Number.isSafeInteger(w) || w < 0) throw new SplitError(`Weight for ${uid} must be a non-negative integer`)
    weightSum += w
  }
  if (weightSum === 0) {
    if (totalMinor === 0) return Object.fromEntries(uids.map((u) => [u, 0]))
    throw new SplitError('Weights sum to zero')
  }
  const sign = totalMinor < 0 ? -1 : 1
  const abs = Math.abs(totalMinor)
  const rows = uids.map((uid) => {
    // BigInt keeps total * weight exact even for very large amounts.
    const num = BigInt(abs) * BigInt(weights[uid]!)
    const floor = num / BigInt(weightSum)
    const rem = num - floor * BigInt(weightSum)
    return { uid, floor: Number(floor), rem }
  })
  let leftover = abs - rows.reduce((s, r) => s + r.floor, 0)
  const order = [...rows].sort((a, b) => (a.rem === b.rem ? (a.uid < b.uid ? -1 : 1) : a.rem > b.rem ? -1 : 1))
  const bonus = new Set<string>()
  for (const r of order) {
    if (leftover <= 0) break
    if (weights[r.uid] === 0) continue
    bonus.add(r.uid)
    leftover--
  }
  const out: Allocation = {}
  for (const r of rows) out[r.uid] = sign * (r.floor + (bonus.has(r.uid) ? 1 : 0))
  return out
}

/** Exact amounts: each value is already in minor units and must sum to the total. */
export function splitExact(totalMinor: number, amounts: Allocation): Allocation {
  assertMinor(totalMinor, 'total')
  const uids = Object.keys(amounts)
  if (uids.length === 0) throw new SplitError('Pick at least one person to split with')
  let sum = 0
  for (const uid of uids) {
    const v = amounts[uid]!
    assertMinor(v, `amount for ${uid}`)
    if (v < 0) throw new SplitError('Amounts cannot be negative')
    sum += v
  }
  if (sum !== totalMinor) throw new SplitError(`Amounts add up to ${sum} but the total is ${totalMinor}`)
  return { ...amounts }
}

/** Percent split where each value is basis points and they must total 100%. */
export function splitPercent(totalMinor: number, bps: Allocation): Allocation {
  const uids = Object.keys(bps)
  if (uids.length === 0) throw new SplitError('Pick at least one person to split with')
  const sum = uids.reduce((s, u) => s + bps[u]!, 0)
  if (sum !== FULL_PERCENT_BPS) throw new SplitError(`Percentages add up to ${sum / 100}% instead of 100%`)
  return allocateProportional(totalMinor, bps)
}

export interface SplitInput {
  amountMinor: number
  splitMethod: SplitMethod
  participantIds: string[]
  /** exact: minor units per uid; percent: basis points per uid; equal: ignored. */
  splitValues?: Allocation | null
}

export function computeSplit(input: SplitInput): Allocation {
  const { amountMinor, splitMethod, participantIds } = input
  const values = input.splitValues ?? {}
  const pick = (): Allocation => {
    const out: Allocation = {}
    for (const uid of sortedUnique(participantIds)) out[uid] = values[uid] ?? 0
    return out
  }
  switch (splitMethod) {
    case 'equal':
      return splitEqual(amountMinor, participantIds)
    case 'exact':
      return splitExact(amountMinor, pick())
    case 'percent':
      return splitPercent(amountMinor, pick())
  }
}

export interface ShareAmounts {
  amountMinor: number
  amountBaseMinor: number
}

/**
 * Per-person amounts in both the expense currency and the trip base currency.
 * Base amounts are allocated from the converted total in proportion to the
 * original shares, so base shares always sum to the expense's base total.
 */
export function computeShareAmounts(input: SplitInput & { amountBaseMinor: number }): Record<string, ShareAmounts> {
  const original = computeSplit(input)
  const weights: Allocation = {}
  for (const [uid, v] of Object.entries(original)) weights[uid] = Math.abs(v)
  const base =
    input.amountBaseMinor === input.amountMinor ? original : allocateProportional(input.amountBaseMinor, weights)
  const out: Record<string, ShareAmounts> = {}
  for (const uid of Object.keys(original)) out[uid] = { amountMinor: original[uid]!, amountBaseMinor: base[uid] ?? 0 }
  return out
}
