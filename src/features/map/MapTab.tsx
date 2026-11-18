import { lazy, Suspense, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { MapPinned } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { useTrip } from '@/features/trips/TripContext'
import { useItems } from '@/features/itinerary/itineraryApi'
import { useExpenses } from '@/features/expenses/expenseApi'
import { ITEM_TYPE_META } from '@/features/itinerary/itemTypes'
import { ItemTypeIcon } from '@/features/itinerary/ItemTypeIcon'
import { timeLabel } from '@/features/itinerary/format'
import { hasMaps } from '@/lib/maps'
import { cn } from '@/lib/utils'
import { formatShortDate, tripDays } from '@/shared/dates'
import { ITEM_TYPES, type ItemType } from '@/shared/itinerary'
import { mapStops } from './mapData'
import { StopCard } from './StopCard'

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
  const { data: expenses } = useExpenses(trip.id)
  const days = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate])
  const day = days.includes(params.get('day') ?? '') ? params.get('day') : null
  // One type at a time (or all), like the day filter.
  const typeParam = params.get('type') as ItemType | null
  const type = typeParam && ITEM_TYPES.includes(typeParam) ? typeParam : null
  const types = useMemo(() => new Set(type ? [type] : ITEM_TYPES), [type])
  const stops = useMemo(() => mapStops(items, day, types), [items, day, types])
  const selectedId = params.get('item')
  const selected = stops.find((s) => s.item.id === selectedId) ?? null
  const expensesById = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses])

  const set = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (v) n.set(k, v)
        else n.delete(k)
        return n
      },
      { replace: true },
    )

  const filters = (
    <div className="glass pointer-events-auto space-y-1 rounded-[1.5rem] p-1.5">
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Day">
        <Chip on={!day} onClick={() => set('day', null)}>
          All days
        </Chip>
        {days.map((d, i) => (
          <Chip key={d} on={day === d} onClick={() => set('day', d)} label={`Day ${i + 1}, ${formatShortDate(d)}`}>
            Day {i + 1}
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
          <button type="button" onClick={() => set('item', s.item.id)} className={cn('flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left', s.item.id === selectedId && 'bg-primary/8')}>
            <span className="w-6 text-center text-sm font-bold text-muted-foreground">{s.number ?? ''}</span>
            <ItemTypeIcon type={s.item.type} className="size-9" />
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

  if (!loading && items.every((i) => i.location?.lat == null)) {
    return (
      <main className="mx-auto max-w-2xl px-4 pt-4">
        <EmptyState icon={<MapPinned />} title="Nothing on the map yet" description="Add a location to a plan or stay and it will show up here." />
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
            <TripMap stops={stops} selectedId={selectedId} onSelect={(id) => set('item', id)} />
          </Suspense>
        ) : (
          <div className="h-full overflow-y-auto bg-grouped px-3 pt-36 pb-32">
            <p className="mb-3 rounded-2xl bg-warning/15 p-3 text-sm">Add <code>VITE_GOOGLE_MAPS_API_KEY</code> and a Map ID to see these on a map. Here’s the list in the meantime.</p>
            <div className="md:hidden">{list}</div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-3 top-3">{filters}</div>
        {selected && (
          <div className="pointer-events-none absolute inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-4 md:left-auto md:w-96">
            <StopCard stop={selected} expense={selected.item.linkedExpenseId ? expensesById.get(selected.item.linkedExpenseId) : undefined} onClose={() => set('item', null)} />
          </div>
        )}
      </div>
    </div>
  )
}
