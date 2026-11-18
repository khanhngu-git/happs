/**
 * Money helpers. All amounts are integers in minor units (cents, fen, yen...).
 * Floats are never used to *store* money; they only appear transiently when
 * applying an FX rate, and the result is rounded straight back to an integer.
 */

const digitsCache = new Map<string, number>()

/** Number of minor-unit digits for an ISO 4217 currency (USD → 2, JPY → 0). */
export function currencyDigits(currency: string): number {
  const code = currency.toUpperCase()
  const cached = digitsCache.get(code)
  if (cached !== undefined) return cached
  let digits: number
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    digits = 2
  }
  digitsCache.set(code, digits)
  return digits
}

/** Throws unless `n` is a safe integer. Use at module boundaries. */
export function assertMinor(n: number, label = 'amount'): void {
  if (!Number.isSafeInteger(n)) throw new Error(`${label} must be an integer number of minor units, got ${n}`)
}

/**
 * Parse a user-typed decimal string ("12.5", "1,234.56") into minor units
 * using string arithmetic only. Returns null for invalid input or for more
 * decimal places than the currency allows.
 */
export function parseDecimalToMinor(input: string, digits: number): number | null {
  const cleaned = input.replace(/[\s,]/g, '')
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(cleaned)
  if (!m || cleaned === '' || cleaned === '.' || cleaned === '-') return null
  const [, neg, whole = '', frac = ''] = m
  if (whole === '' && frac === '') return null
  if (frac.length > digits) return null
  const padded = frac.padEnd(digits, '0')
  const value = Number((whole || '0') + padded)
  if (!Number.isSafeInteger(value)) return null
  return neg ? -value : value
}

export function parseToMinor(input: string, currency: string): number | null {
  return parseDecimalToMinor(input, currencyDigits(currency))
}

/** Minor units → plain decimal string ("1234.50"), no grouping or symbol. */
export function minorToDecimalString(minor: number, digits: number): string {
  assertMinor(minor)
  const neg = minor < 0
  const abs = String(Math.abs(minor)).padStart(digits + 1, '0')
  const whole = digits === 0 ? abs : abs.slice(0, abs.length - digits)
  const frac = digits === 0 ? '' : `.${abs.slice(abs.length - digits)}`
  return `${neg ? '-' : ''}${whole}${frac}`
}

export function minorToInputString(minor: number, currency: string): string {
  return minorToDecimalString(minor, currencyDigits(currency))
}

/** Format minor units for display, e.g. formatMoney(12050, 'AUD') → "A$120.50". */
export function formatMoney(minor: number, currency: string, locale?: string): string {
  const digits = currencyDigits(currency)
  const dec = minorToDecimalString(minor, digits)
  try {
    // Intl accepts decimal strings, which avoids any float round-tripping.
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(dec as unknown as number)
  } catch {
    return `${currency} ${dec}`
  }
}

/** Round half away from zero: the conventional rounding for money. */
export function roundHalfAwayFromZero(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x)
}

/**
 * Convert an amount between currencies with a rate expressed as
 * "1 unit of `from` = `rate` units of `to`". Accounts for differing minor
 * digits (e.g. JPY has 0, USD has 2).
 */
export function convertMinor(amountMinor: number, from: string, to: string, rate: number): number {
  assertMinor(amountMinor)
  if (from.toUpperCase() === to.toUpperCase()) return amountMinor
  if (!(rate > 0) || !Number.isFinite(rate)) throw new Error(`Invalid FX rate ${rate}`)
  const shift = currencyDigits(to) - currencyDigits(from)
  // Scale with an integer power of ten first to limit float error.
  const scaled = amountMinor * rate * 10 ** shift
  return roundHalfAwayFromZero(Number(scaled.toPrecision(15)))
}

export function sumMinor(values: Iterable<number>): number {
  let total = 0
  for (const v of values) {
    assertMinor(v)
    total += v
  }
  return total
}

export const COMMON_CURRENCIES = [
  'AUD', 'USD', 'EUR', 'GBP', 'NZD', 'CAD', 'CNY', 'JPY', 'SGD', 'HKD', 'KRW', 'THB', 'VND', 'IDR', 'MYR',
  'PHP', 'INR', 'CHF', 'SEK', 'NOK', 'DKK', 'MXN', 'BRL', 'ZAR', 'AED', 'TWD',
] as const
