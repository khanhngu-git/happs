import { lazy, Suspense, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { MapPinned, MapPinPlus } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { useTrip } from '@/features/trips/TripContext'
import { useItems } from '@/features/itinerary/itineraryApi'
import { ITEM_TYPE_META } from '@/features/itinerary/itemTypes'
import { ItemTypeIcon } from '@/features/itinerary/ItemTypeIcon'
import { timeLabel } from '@/features/itinerary/format'
import { useItineraryDialogs } from '@/features/itinerary/ItineraryDialogs'
import { hasMaps } from '@/lib/maps'
import { cn } from '@/lib/utils'
import { formatShortDate, todayInZone, tripDays } from '@/shared/dates'
import { ITEM_TYPES, type ItemType } from '@/shared/itinerary'
import { mapStops } from './mapData'
import { useLiveLocation } from '@/features/location/LiveLocationProvider'
import { StopCard } from './StopCard'
import { StopStrip } from './StopStrip'
import { DroppedPinCard, PersonCard } from './PlaceCards'

const TripMap = lazy(() => import('./TripMap').then((m) => ({ default: m.TripMap })))

/** Filter chips live on the map's functional layer: one glass bar, plain fills inside. */
function Chip({ on, onClick, children, label }: { on: boolean; onClick(): void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={cn('inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors', on ? 'bg-foreground text-background' : 'text-foreground active:bg-foreground/[0.08]')}
    >
      {children}
    </button>
  )
}

export function MapTab() {
  const { trip } = useTrip()
  const [params, setParams] = useSearchParams()
  const { data: items, loading } = useItems(trip.id)
  const { dialogs, editItem, addPrefilled } = useItineraryDialogs(items)
  const days = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate])
  // During the trip the map opens on today; "All days" is an explicit choice.
  const today = todayInZone(trip.timeZone)
  const dayParam = params.get('day')
  const day = dayParam === 'all' ? null : days.includes(dayParam ?? '') ? dayParam : days.includes(today) ? today : null
  const dayBar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Keep the chosen day's chip in view in the scrolling row.
    dayBar.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [day])
  // One type at a time (or all), like the day filter.
  const typeParam = params.get('type') as ItemType | null
  const type = typeParam && ITEM_TYPES.includes(typeParam) ? typeParam : null
  const types = useMemo(() => new Set(type ? [type] : ITEM_TYPES), [type])
  const stops = useMemo(() => mapStops(items, day, types), [items, day, types])
  const selectedId = params.get('item')
  const personId = params.get('person')
  const live = useLiveLocation()
  const selected = stops.find((s) => s.item.id === selectedId) ?? null

  const person = live.people.find((p) => p.uid === personId) ?? null
  // A dropped pin lives in the URL as "lat,lng", like the selected stop.
  const pin = useMemo(() => {
    const [lat, lng] = (params.get('pin') ?? '').split(',').map(Number)
    return lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && params.get('pin') ? { lat, lng } : null
  }, [params])

  const setMany = (changes: Record<string, string | null>) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        for (const [k, v] of Object.entries(changes)) {
          if (v) n.set(k, v)
          else n.delete(k)
        }
        return n
      },
      { replace: true },
    )
  const set = (k: string, v: string | null) => setMany({ [k]: v })
  /** Only one thing is open at a time: a stop, a person, or a dropped pin. */
  const open = (what: { item?: string; person?: string; pin?: string }) => setMany({ item: what.item ?? null, person: what.person ?? null, pin: what.pin ?? null })
  const planDay = day ?? (days.includes(today) ? today : trip.startDate)

  const filters = (
    <div className="glass pointer-events-auto space-y-1 rounded-[1.5rem] p-1.5">
      <div ref={dayBar} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Day">
        <Chip on={!day} onClick={() => set('day', 'all')}>
          All days
        </Chip>
        {days.map((d, i) => (
          <Chip key={d} on={day === d} onClick={() => set('day', d)} label={`Day ${i + 1}, ${formatShortDate(d)}${d === today ? ', today' : ''}`}>
            {d === today ? 'Today' : `Day ${i + 1}`}
          </Chip>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Type">
        <Chip on={!type} onClick={() => set('type', null)}>
          Everything
        </Chip>
        {ITEM_TYPES.map((t) => {
          const Icon = ITEM_TYPE_META[t].icon
          return (
            <Chip key={t} on={type === t} onClick={() => set('type', type === t ? null : t)}>
              <Icon className="size-4" aria-hidden /> {ITEM_TYPE_META[t].label}
            </Chip>
          )
        })}
      </div>
    </div>
  )

  const list = (
    <ol className="divide-y divide-border/70 overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70">
      {stops.map((s) => (
        <li key={s.item.id}>
          <button type="button" onClick={() => open({ item: s.item.id })} className={cn('flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left', s.item.id === selectedId && 'bg-primary/8')}>
            <span className="w-6 text-center text-sm font-bold text-muted-foreground">{s.number ?? ''}</span>
            <ItemTypeIcon type={s.item.type} title={s.item.title} className="size-9" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.item.title}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {formatShortDate(s.item.date)} · {timeLabel(s.item)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )

  // With nothing pinned, the map still opens when someone is sharing where they are.
  if (!loading && items.every((i) => i.location?.lat == null) && !(hasMaps && live.people.length > 0)) {
    const unpinned = [...items].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    return (
      <main className="mx-auto max-w-2xl px-4 pt-4 pb-28">
        <EmptyState
          icon={<MapPinned />}
          title="Nothing on the map yet"
          description={unpinned.length ? 'Search for a place on any plan below and it will be pinned here.' : 'Add plans with a place in the Itinerary and they will show up here.'}
        />
        {unpinned.length > 0 && (
          <ul className="mt-4 divide-y divide-border/70 overflow-hidden rounded-[1.25rem] bg-card ring-1 ring-border/70">
            {unpinned.map((it) => (
              <li key={it.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
                <ItemTypeIcon type={it.type} title={it.title} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{it.title}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {formatShortDate(it.date)} · {it.location?.name ? `${it.location.name} (not pinned)` : timeLabel(it)}
                  </span>
                </span>
                <button type="button" onClick={() => editItem(it)} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-sm font-semibold text-primary">
                  <MapPinPlus className="size-4" aria-hidden /> Add location
                </button>
              </li>
            ))}
          </ul>
        )}
        {dialogs}
      </main>
    )
  }

  return (
    // Full screen under the header; on wide screens the list sits beside the map.
    <div className="fixed inset-x-0 top-[calc(3rem+env(safe-area-inset-top))] bottom-0 md:grid md:grid-cols-[22rem_1fr]">
      <aside className="hidden overflow-y-auto border-r bg-grouped p-3 pb-28 md:block">{list}</aside>
      <div className="relative h-full">
        {hasMaps ? (
          <Suspense fallback={<Skeleton className="size-full rounded-none" />}>
            <TripMap
              stops={stops}
              selectedId={selectedId}
              onSelect={(id) => open({ item: id ?? undefined })}
              personId={personId}
              onSelectPerson={(uid) => open({ person: uid })}
              pin={pin}
              onDropPin={(p) => open({ pin: `${p.lat.toFixed(6)},${p.lng.toFixed(6)}` })}
              onClear={() => open({})}
            />
          </Suspense>
        ) : (
          <div className="h-full overflow-y-auto bg-grouped px-3 pt-36 pb-32">
            <p className="mb-3 rounded-2xl bg-warning/15 p-3 text-sm">Add <code>VITE_GOOGLE_MAPS_API_KEY</code> and a Map ID to see these on a map. Here’s the list in the meantime.</p>
            <div className="md:hidden">{list}</div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-3 top-3">{filters}</div>
        {selected ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-4 md:left-auto md:w-96">
            <StopCard stop={selected} onClose={() => set('item', null)} />
          </div>
        ) : person ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-4 md:left-auto md:w-96">
            <PersonCard person={person} now={live.now} onClose={() => open({})} />
          </div>
        ) : pin ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-4 md:left-auto md:w-96">
            <DroppedPinCard
              pin={pin}
              onClose={() => open({})}
              onAdd={(location) => {
                open({})
                addPrefilled({ type: 'activity', title: location.name === 'Dropped pin' ? '' : location.name, date: planDay, startTime: null, location, photoURL: null, notes: '', cost: null })
              }}
            />
          </div>
        ) : (
          hasMaps &&
          day &&
          stops.some((s) => s.item.type !== 'stay') && (
            <div className="pointer-events-none absolute inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:hidden">
              <StopStrip stops={stops} onSelect={(id) => open({ item: id })} />
            </div>
          )
        )}
      </div>
      {dialogs}
    </div>
  )
}
