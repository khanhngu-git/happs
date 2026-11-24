import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CalendarArrowDown, MapPin, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { ItemTypeIcon } from '@/features/itinerary/ItemTypeIcon'
import { buildIcs, downloadIcs } from '@/features/itinerary/calendar'
import { openAmapOnIOS } from '@/features/itinerary/openAmap'
import { amapUrl, googleDirectionsUrl, isMainlandChina } from '@/features/itinerary/routes'
import { loadSharedTrip } from './shareApi'
import { formatDateRange, formatLongDate, formatTime, tripDays } from '@/shared/dates'
import { itemsForDay, staysForDay } from '@/shared/itinerary'
import type { SharedTrip } from '@/shared/schemas'

type SharedItem = SharedTrip['items'][number]

/** Public, read-only view of a trip's plan (`/share/:token`). No sign-in needed. */
export function SharedTripPage() {
  const { token = '' } = useParams()
  const [trip, setTrip] = useState<SharedTrip | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    loadSharedTrip(token).then(
      (t) => live && setTrip(t),
      (err: Error) => live && setError(err.message),
    )
    return () => {
      live = false
    }
  }, [token])

  if (error)
    return (
      <main className="mx-auto max-w-lg px-4 pt-16">
        <EmptyState icon={<MapPin />} title="This link doesn’t work" description={error} />
      </main>
    )
  if (!trip) return <FullScreenLoader />

  const days = tripDays(trip.startDate, trip.endDate)
  const china = isMainlandChina(trip.timeZone)
  const exportCalendar = () =>
    downloadIcs(
      trip.name,
      buildIcs(
        { id: token.slice(0, 8), name: trip.name, timeZone: trip.timeZone },
        trip.items.map((i) => ({ ...i, notes: '', bookingRef: '', bookingUrl: '', location: i.location ? { name: i.location.name, address: i.location.address } : null })),
      ),
    )

  return (
    <main className="mx-auto min-h-dvh max-w-2xl bg-grouped px-4 pt-6 pb-16">
      {trip.coverPhotoURL && <img src={trip.coverPhotoURL} alt="" className="mb-4 aspect-[2/1] w-full rounded-3xl object-cover" />}
      <p className="text-sm font-medium text-muted-foreground">Shared plan · read only</p>
      <h1 className="large-title">
        {trip.coverEmoji && <span aria-hidden>{trip.coverEmoji} </span>}
        {trip.name}
      </h1>
      <p className="text-[0.9375rem] text-muted-foreground">
        {[trip.destination, formatDateRange(trip.startDate, trip.endDate)].filter(Boolean).join(' · ')} · times in {trip.timeZone.replaceAll('_', ' ')}
      </p>
      {trip.items.length > 0 && (
        <Button variant="secondary" size="sm" className="mt-3 text-primary" onClick={exportCalendar}>
          <CalendarArrowDown /> Add to my calendar
        </Button>
      )}

      <div className="mt-6 space-y-5">
        {days.map((d, n) => {
          const stays = staysForDay(trip.items, d)
          const plans = itemsForDay(trip.items, d).filter((i) => i.type !== 'stay')
          return (
            <section key={d} aria-labelledby={`d-${d}`}>
              <h2 id={`d-${d}`} className="px-1 pb-1.5 text-[0.8125rem] font-medium text-muted-foreground uppercase">
                Day {n + 1} · {formatLongDate(d)}
              </h2>
              <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl bg-card ring-1 ring-border/70">
                {stays.map((s) => (
                  <Row key={`stay-${s.stay.id}`} item={s.stay} china={china} when={s.checkingIn ? 'Check in' : s.checkingOut && !s.sleeping ? 'Check out' : 'Staying'} />
                ))}
                {plans.map((p) => (
                  <Row key={p.id} item={p} china={china} when={p.startTime ? `${formatTime(p.startTime)}${p.endTime ? ` – ${formatTime(p.endTime)}` : ''}` : 'Anytime'} />
                ))}
                {stays.length + plans.length === 0 && <li className="px-4 py-3.5 text-[0.9375rem] text-muted-foreground">Free day</li>}
              </ul>
            </section>
          )
        })}
      </div>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        Planned with happs. <Link to="/signup" className="font-medium text-primary">Plan your own trip</Link>
      </p>
    </main>
  )
}

function Row({ item, when, china }: { item: SharedItem; when: string; china: boolean }) {
  const loc = item.location
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <ItemTypeIcon type={item.type} title={item.title} className="size-8" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1.0625rem]">{item.title}</span>
        <span className="block truncate text-[0.875rem] text-muted-foreground">
          {when}
          {loc?.name && loc.name !== item.title && ` · ${loc.name}`}
        </span>
      </span>
      {loc && (
        <a
          href={china ? amapUrl(loc) : googleDirectionsUrl(loc)}
          target="_blank"
          rel="noreferrer"
          onClick={china ? (e) => openAmapOnIOS(e, loc) : undefined}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          aria-label={`Directions to ${item.title}`}
        >
          <Navigation className="size-4" />
        </a>
      )}
    </li>
  )
}
