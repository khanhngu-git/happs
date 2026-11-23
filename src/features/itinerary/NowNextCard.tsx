import { Clock } from 'lucide-react'
import type { Item } from '@/lib/firestore'
import { formatTime } from '@/shared/dates'
import { nowAndNext } from '@/shared/itinerary'
import { useTrip } from '@/features/trips/TripContext'
import { inMinutes } from './format'
import { ItemTypeIcon } from './ItemTypeIcon'
import { RouteActions } from './RouteActions'
import { useTripTime } from './useTripDay'

/**
 * During the trip, today's view opens with what's on now and what's next,
 * with a countdown and one tap to get there.
 */
export function NowNextCard({ items, day, onOpen }: { items: Item[]; day: string; onOpen(i: Item): void }) {
  const { trip } = useTrip()
  const time = useTripTime(trip.timeZone)
  const { now, next, minutesToNext } = nowAndNext(items, day, time)
  if (!now && !next) return null
  // Directions go to the next stop (that's where you're heading), else to where you are now.
  const target = next?.location ? next : now?.location ? now : null

  return (
    <section aria-label="Now and next" className="rounded-2xl bg-primary/8 p-4 ring-1 ring-primary/20">
      {now && (
        <button type="button" onClick={() => onOpen(now)} className="flex w-full items-center gap-3 text-left">
          <ItemTypeIcon type={now.type} title={now.title} className="size-9" />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8125rem] font-semibold text-primary uppercase">Now</span>
            <span className="block truncate text-[1.0625rem] font-medium">{now.title}</span>
            {now.endTime && <span className="block text-sm text-muted-foreground">Until {formatTime(now.endTime)}</span>}
          </span>
        </button>
      )}
      {next && (
        <button type="button" onClick={() => onOpen(next)} className={`flex w-full items-center gap-3 text-left ${now ? 'mt-3 border-t border-primary/15 pt-3' : ''}`}>
          <ItemTypeIcon type={next.type} title={next.title} className="size-9" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-[0.8125rem] font-semibold text-primary uppercase">
              <Clock className="size-3.5" aria-hidden /> Next · {inMinutes(minutesToNext!)}
            </span>
            <span className="block truncate text-[1.0625rem] font-medium">{next.title}</span>
            <span className="block truncate text-sm text-muted-foreground">
              {formatTime(next.startTime!)}
              {next.location?.name && next.location.name !== next.title && ` · ${next.location.name}`}
            </span>
          </span>
        </button>
      )}
      {target?.location && <RouteActions to={target.location} from={target === next ? now?.location : null} className="mt-3" />}
    </section>
  )
}
