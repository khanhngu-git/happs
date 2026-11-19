import type { DisplayPrice } from '@/shared/booking'
import { formatMoney } from '@/shared/money'

/** Short label for buttons: base-currency price, prefixed with ≈ if converted. */
export function priceLabel(item: { priceMinor: number; currency: string; display?: DisplayPrice }): string {
  const d = item.display ?? { priceMinor: item.priceMinor, currency: item.currency, approximate: false }
  return `${d.approximate ? '≈ ' : ''}${formatMoney(d.priceMinor, d.currency)}`
}
