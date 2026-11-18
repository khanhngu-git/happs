import { Link } from 'react-router'
import { MapPin } from 'lucide-react'
import { AvatarStack } from '@/components/UserAvatar'
import { Badge } from '@/components/ui/badge'
import type { Trip } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { diffDays, formatDateRange, todayInZone, type TripPhase } from '@/shared/dates'
import { coverClass, useMembers } from './tripApi'

function phaseLabel(trip: Trip, phase: TripPhase): string {
  const today = todayInZone(trip.timeZone)
  if (phase === 'ongoing') return `Day ${diffDays(today, trip.startDate) + 1}`
  if (phase === 'upcoming') {
    const d = diffDays(trip.startDate, today)
    return d === 1 ? 'Tomorrow' : `In ${d} days`
  }
  return 'Done'
}

/** Content-layer card: brand colour lives here, not on the controls. */
export function TripCard({ trip, phase }: { trip: Trip; phase: TripPhase }) {
  const { data: members } = useMembers(trip.id)
  return (
    <Link
      to={`/trips/${trip.id}/itinerary`}
      className="group block overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70 transition-shadow outline-none hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/60"
    >
      <div className={cn('relative flex h-32 items-end bg-gradient-to-br p-4', coverClass(trip.coverColor), phase === 'past' && 'grayscale-[0.5]')}>
        {trip.coverPhotoURL ? (
          <>
            <img src={trip.coverPhotoURL} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
            {/* Dimming so the badge stays legible over bright photos. */}
            <span className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" aria-hidden />
          </>
        ) : (
          <span className="absolute top-3 right-4 text-4xl drop-shadow-sm" aria-hidden>
            {trip.coverEmoji ?? '✈️'}
          </span>
        )}
        <Badge className="relative bg-black/40 text-white backdrop-blur-sm">{phaseLabel(trip, phase)}</Badge>
      </div>
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[1.0625rem] font-semibold">{trip.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
            {trip.destination && (
              <>
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{trip.destination}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className="whitespace-nowrap">{formatDateRange(trip.startDate, trip.endDate)}</span>
          </p>
        </div>
        <AvatarStack people={members} />
      </div>
    </Link>
  )
}
