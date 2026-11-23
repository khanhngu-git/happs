import { useNavigate } from 'react-router'
import { ArrowRight, CalendarDays, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTrip } from '@/features/trips/TripContext'
import { formatShortDate } from '@/shared/dates'
import { timeLabel } from '@/features/itinerary/format'
import { RouteActions } from '@/features/itinerary/RouteActions'
import { ItemTypeIcon } from '@/features/itinerary/ItemTypeIcon'
import type { MapStop } from './mapData'

/** Bottom card for the tapped marker (functional layer, floats over the map). */
export function StopCard({ stop, onClose }: { stop: MapStop; onClose(): void }) {
  const { trip } = useTrip()
  const navigate = useNavigate()
  const { item } = stop
  return (
    <div className="glass-strong pointer-events-auto rounded-[1.75rem] p-4" role="dialog" aria-label={item.title}>
      {item.photoURL && <img src={item.photoURL} alt="" className="mb-3 aspect-[2/1] w-full rounded-2xl object-cover" />}
      <div className="flex items-start gap-3">
        <ItemTypeIcon type={item.type} title={item.title} className="size-11" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {stop.number !== null && <span className="mr-1">{stop.number}.</span>}
            {item.title}
          </p>
          <p className="text-sm">
            {formatShortDate(item.date)} · {timeLabel(item)}
          </p>
          {item.location?.localName && item.location.localName !== item.title && (
            <p className="truncate text-sm font-medium" lang="zh-CN">
              {item.location.localName}
            </p>
          )}
          {stop.to ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
              <span className="truncate">{item.location?.name}</span>
              <ArrowRight className="size-3.5 shrink-0" aria-label="to" />
              <span className="truncate">{stop.to.name}</span>
            </p>
          ) : (
            item.location?.address && <p className="truncate text-sm">{item.location.address}</p>
          )}
        </div>
        <button type="button" onClick={onClose} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground/8" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <RouteActions to={item.location!} className="mt-3" />
      <Button variant="ghost" className="mt-1 w-full text-primary" onClick={() => navigate(`/trips/${trip.id}/itinerary?day=${item.date}&item=${item.id}`)}>
        <CalendarDays /> In itinerary
      </Button>
    </div>
  )
}
