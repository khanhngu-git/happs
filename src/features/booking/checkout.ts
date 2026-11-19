import { api, callableMessage } from '@/lib/functions'
import type { BookingKind } from '@/shared/booking'

/**
 * Open RouteStack's hosted checkout. The tab is opened synchronously (so
 * iOS Safari doesn't block it as a popup) and pointed at the URL once the
 * server returns it.
 */
export async function openCheckout(tripId: string, kind: BookingKind, ref: unknown): Promise<void> {
  const win = window.open('', '_blank')
  try {
    const { url } = await api.booking({ action: 'checkout', tripId, kind, ref: ref as Record<string, unknown> })
    if (!url) throw new Error('No checkout link')
    if (win) win.location.href = url
    else window.location.href = url
  } catch (err) {
    win?.close()
    throw new Error(callableMessage(err), { cause: err })
  }
}
