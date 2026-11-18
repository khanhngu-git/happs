import { useNavigate } from 'react-router'
import { CalendarDays, ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTrip } from '@/features/trips/TripContext'
import type { Expense } from '@/lib/firestore'
import { formatMoney } from '@/shared/money'
import { formatShortDate } from '@/shared/dates'
import { googleMapsUrl, timeLabel } from '@/features/itinerary/format'
import { ItemTypeIcon } from '@/features/itinerary/ItemTypeIcon'
import type { MapStop } from './mapData'

/** Bottom card for the tapped marker (functional layer, floats over the map). */
export function StopCard({ stop, expense, onClose }: { stop: MapStop; expense?: Expense; onClose(): void }) {
  const { trip } = useTrip()
  const navigate = useNavigate()
  const { item } = stop
  return (
    <div className="glass-strong pointer-events-auto rounded-[1.75rem] p-4" role="dialog" aria-label={item.title}>
      <div className="flex items-start gap-3">
        <ItemTypeIcon type={item.type} className="size-11" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {stop.number !== null && <span className="mr-1">{stop.number}.</span>}
            {item.title}
          </p>
          <p className="text-sm">
            {formatShortDate(item.date)} · {timeLabel(item)}
            {expense && <> · {formatMoney(expense.amountMinor, expense.currency)}</>}
          </p>
          {item.location?.address && <p className="truncate text-sm">{item.location.address}</p>}
        </div>
        <button type="button" onClick={onClose} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground/8" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button asChild variant="secondary">
          <a href={googleMapsUrl(item.location!)} target="_blank" rel="noreferrer">
            <ExternalLink /> Google Maps
          </a>
        </Button>
        <Button onClick={() => navigate(`/trips/${trip.id}/itinerary?day=${item.date}&item=${item.id}`)}>
          <CalendarDays /> In itinerary
        </Button>
      </div>
    </div>
  )
}
