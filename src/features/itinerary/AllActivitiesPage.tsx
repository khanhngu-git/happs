import { Skeleton } from '@/components/ui/skeleton'
import { useTrip } from '@/features/trips/TripContext'
import { formatLongDate, tripDays } from '@/shared/dates'
import { itemsForDay, staysForDay } from '@/shared/itinerary'
import { ActivityRow } from './ActivityRow'
import { useItineraryDialogs } from './ItineraryDialogs'
import { useItems } from './itineraryApi'

/** Every activity in one scrolling list, grouped by day. Nothing else. */
export function AllActivitiesPage() {
  const { trip } = useTrip()
  const { data: items, loading } = useItems(trip.id)
  const { dialogs, openItem } = useItineraryDialogs(items)
  const days = tripDays(trip.startDate, trip.endDate)

  return (
    <main className="mx-auto max-w-2xl pb-6">
      <h1 className="large-title px-4 pb-3">All activities</h1>
      {loading ? (
        <div className="space-y-3 px-4" aria-busy>
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-5 px-4">
          {days.map((d, i) => {
            const stays = staysForDay(items, d).filter((s) => s.checkingIn)
            const list = [...stays.map((s) => s.stay), ...itemsForDay(items, d).filter((x) => x.type !== 'stay')]
            return (
              <section key={d} aria-labelledby={`all-${d}`}>
                <h2 id={`all-${d}`} className="px-4 pb-1.5 text-[0.8125rem] font-medium text-muted-foreground uppercase">
                  Day {i + 1} · {formatLongDate(d)}
                </h2>
                {list.length === 0 ? (
                  <p className="rounded-2xl bg-card px-4 py-3.5 text-[0.9375rem] text-muted-foreground ring-1 ring-border/70">Free day</p>
                ) : (
                  <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl ring-1 ring-border/70">
                    {list.map((it) => (
                      <ActivityRow key={it.id} item={it} onOpen={() => openItem(it)} />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
      {dialogs}
    </main>
  )
}
