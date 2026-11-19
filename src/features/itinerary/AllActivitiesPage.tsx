import { CalendarArrowDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTrip } from '@/features/trips/TripContext'
import { formatLongDate, tripDays } from '@/shared/dates'
import { itemsForDay, itemsOutsideTrip, staysForDay } from '@/shared/itinerary'
import { buildIcs, downloadIcs } from './calendar'
import { ActivityRow } from './ActivityRow'
import { useItineraryDialogs } from './ItineraryDialogs'
import { useItems } from './itineraryApi'

/** Every activity in one scrolling list, grouped by day. Nothing else. */
export function AllActivitiesPage() {
  const { trip } = useTrip()
  const { data: items, loading } = useItems(trip.id)
  const { dialogs, openItem } = useItineraryDialogs(items)
  const days = tripDays(trip.startDate, trip.endDate)
  const outside = itemsOutsideTrip(items, trip.startDate, trip.endDate)

  const exportCalendar = () => {
    try {
      downloadIcs(trip.name, buildIcs(trip, items))
      toast.success('Calendar file saved. Open it to add the plans to your calendar.')
    } catch (err) {
      console.error(err)
      toast.error('Couldn’t make the calendar file')
    }
  }

  return (
    <main className="mx-auto max-w-2xl pb-6">
      <div className="flex items-end justify-between gap-2 px-4 pb-3">
        <h1 className="large-title">All activities</h1>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" className="text-primary" onClick={exportCalendar}>
            <CalendarArrowDown /> Add to calendar
          </Button>
        )}
      </div>
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
          {outside.length > 0 && (
            <section aria-labelledby="all-outside">
              <h2 id="all-outside" className="px-4 pb-1.5 text-[0.8125rem] font-medium text-muted-foreground uppercase">
                Outside the trip dates
              </h2>
              <p className="px-4 pb-2 text-sm text-muted-foreground">These don’t show in the day view. Open one and change its date to move it into the trip.</p>
              <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl ring-1 ring-border/70">
                {outside.map((it) => (
                  <ActivityRow key={it.id} item={it} onOpen={() => openItem(it)} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {dialogs}
    </main>
  )
}
