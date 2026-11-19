import { useState, type ReactNode } from 'react'
import { CalendarPlus, ExternalLink, Loader2, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useTrip } from '@/features/trips/TripContext'
import type { BookingKind } from '@/shared/booking'
import { openCheckout } from './checkout'

/** iOS-style − n + stepper. */
export function Stepper({ id, label, value, min = 1, max = 9, onChange }: { id: string; label: string; value: number; min?: number; max?: number; onChange(n: number): void }) {
  return (
    <div className="space-y-2">
      <Label id={id}>{label}</Label>
      <div className="flex h-11 items-center justify-between rounded-xl bg-card px-1 ring-1 ring-input" role="group" aria-labelledby={id}>
        <button type="button" className="inline-flex size-10 items-center justify-center rounded-full disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label.toLowerCase()}`}>
          <Minus className="size-4" />
        </button>
        <span className="text-[1.0625rem] font-semibold tabular-nums" aria-live="polite">
          {value}
        </span>
        <button type="button" className="inline-flex size-10 items-center justify-center rounded-full disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label.toLowerCase()}`}>
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}

export function ResultsState({ busy, error, empty, children }: { busy: boolean; error: string | null; empty: boolean; children: ReactNode }) {
  if (busy)
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-[0.9375rem] text-muted-foreground" role="status">
        <Loader2 className="size-5 animate-spin" aria-hidden /> Searching…
      </p>
    )
  if (error) return <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-[0.9375rem]" role="alert">{error}</p>
  if (empty) return <p className="py-8 text-center text-[0.9375rem] text-muted-foreground">Nothing found. Try other dates or a nearby place.</p>
  return <>{children}</>
}

/**
 * "Book" opens the provider's checkout; afterwards "Add to itinerary" puts it
 * on the plan (we can't see the payment, so the traveller confirms).
 */
export function BookActions({ kind, bookRef, priceLabel, onAdd }: { kind: BookingKind; bookRef: unknown; priceLabel: string; onAdd(): Promise<void> }) {
  const { trip } = useTrip()
  const [opening, setOpening] = useState(false)
  const [opened, setOpened] = useState(false)
  const [adding, setAdding] = useState(false)
  return (
    <div className="grid gap-2">
      <Button
        size="lg"
        disabled={opening}
        onClick={async () => {
          setOpening(true)
          try {
            await openCheckout(trip.id, kind, bookRef)
            setOpened(true)
          } catch (err) {
            toast.error((err as Error).message)
          } finally {
            setOpening(false)
          }
        }}
      >
        {opening ? <Loader2 className="animate-spin" /> : <ExternalLink />} Book · {priceLabel}
      </Button>
      <Button
        size="lg"
        variant="secondary"
        disabled={adding}
        onClick={async () => {
          setAdding(true)
          try {
            await onAdd()
          } finally {
            setAdding(false)
          }
        }}
      >
        <CalendarPlus /> {opened ? 'Booked it? Add to itinerary' : 'Add to itinerary'}
      </Button>
      <p className="text-center text-[0.8125rem] text-muted-foreground">Payment and confirmation happen on RouteStack’s secure checkout.</p>
    </div>
  )
}
