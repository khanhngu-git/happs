import { minorToDecimalString, currencyDigits } from '@/shared/money'
import type { PayTo } from '@/shared/schemas'

/** "paypal.me/alex", "@alex" or "alex" → "alex". */
export function paypalUser(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, '').replace(/^(www\.)?paypal\.me\//i, '').replace(/^@/, '').split(/[/?#]/)[0] ?? ''
}

/** PayPal.me link with the amount and currency filled in. */
export function paypalLink(raw: string, minor: number, currency: string): string | null {
  const user = paypalUser(raw)
  if (!/^[A-Za-z0-9]{1,40}$/.test(user)) return null
  return `https://paypal.me/${user}/${minorToDecimalString(minor, currencyDigits(currency))}${currency}`
}

export const hasPayTo = (p: PayTo | null | undefined): p is PayTo => !!p && !!(p.payId || p.paypalMe || p.bank)
