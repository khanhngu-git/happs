import { useState } from 'react'
import { Camera, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTrip } from '@/features/trips/TripContext'
import { api, callableMessage } from '@/lib/functions'
import type { Item } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/shared/money'
import { formatTime } from '@/shared/dates'
import type { ActivityOffer, ActivityOption, PlaceOption } from '@/shared/booking'
import { PlaceField } from './PlaceField'
import { BookActions, ResultsState, Stepper } from './shared'
import { addActivity } from './addToItinerary'

type Option = ActivityOption & { ref: unknown }

export function ActivityPanel({ items, day, onDone }: { items: Item[]; day: string; onDone(): void }) {
  const { trip, me, members } = useTrip()
  const [place, setPlace] = useState<PlaceOption | null>(null)
  const [date, setDate] = useState(day)
  const [adults, setAdults] = useState(Math.max(1, members.length))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ActivityOffer[] | null>(null)
  const [activity, setActivity] = useState<ActivityOffer | null>(null)
  const [options, setOptions] = useState<Option[] | null>(null)
  const [slot, setSlot] = useState<{ option: Option; time: string | null } | null>(null)

  async function search() {
    if (!place) return setError('Choose a destination.')
    setBusy(true)
    setError(null)
    try {
      const res = await api.booking({ action: 'activities', tripId: trip.id, destinationId: place.id, locationName: place.sub || place.label, date })
      setResults(res.activities ?? [])
    } catch (err) {
      setError(callableMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function openActivity(a: ActivityOffer) {
    setActivity(a)
    setOptions(null)
    setSlot(null)
    setBusy(true)
    setError(null)
    try {
      const res = await api.booking({ action: 'activityOptions', tripId: trip.id, activityCode: a.code, date, adults })
      setOptions(res.options ?? [])
    } catch (err) {
      setError(callableMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (activity) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setActivity(null)} className="inline-flex h-11 items-center text-[1.0625rem] text-primary">
          <ChevronLeft className="size-6" aria-hidden /> Activities
        </button>
        {activity.image && <img src={activity.image} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" />}
        <p className="text-xl font-bold">{activity.name}</p>
        <ResultsState busy={busy} error={error} empty={options?.length === 0}>
          <div className="space-y-3">
            {options?.map((o) => (
              <div key={o.gradeCode} className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-border/70">
                <p className="font-semibold tabular-nums">{formatMoney(o.priceMinor, o.currency)} for {adults}</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Start time">
                  {(o.startTimes.length ? o.startTimes : [null]).map((time) => {
                    const on = slot?.option.gradeCode === o.gradeCode && slot.time === time
                    return (
                      <button
                        key={time ?? 'any'}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setSlot({ option: o, time })}
                        className={cn('min-h-11 rounded-full px-4 text-[0.9375rem] font-medium', on ? 'bg-foreground text-background' : 'bg-foreground/[0.07]')}
                      >
                        {time ? formatTime(time) : 'Any time'}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </ResultsState>
        {slot && (
          <BookActions
            kind="activity"
            bookRef={{ ...(slot.option.ref as object), startTime: slot.time ?? undefined }}
            priceLabel={formatMoney(slot.option.priceMinor, slot.option.currency)}
            onAdd={async () => {
              await addActivity(trip, me, items, { name: activity.name, date, startTime: slot.time, image: activity.image, place: activity.place }).then(
                () => {
                  toast.success('Activity added to the itinerary')
                  onDone()
                },
                () => toast.error('Couldn’t add it'),
              )
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PlaceField id="ac-place" label="Where" kind="activity" tripId={trip.id} value={place} onChange={setPlace} initialQuery={trip.destination.split(',')[0] ?? ''} placeholder="City or attraction" />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="ac-date">Date</Label>
          <Input id="ac-date" type="date" min={trip.startDate} max={trip.endDate} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Stepper id="ac-adults" label="People" value={adults} max={20} onChange={setAdults} />
      </div>
      <Button size="lg" className="w-full" onClick={search} disabled={busy}>
        Search activities
      </Button>
      {results !== null || busy || error ? (
        <ResultsState busy={busy} error={error} empty={results?.length === 0}>
          <ul className="space-y-2">
            {results?.map((a) => (
              <li key={a.code}>
                <button type="button" onClick={() => openActivity(a)} className="flex w-full items-center gap-3 rounded-2xl bg-card p-2 text-left ring-1 ring-border/70 active:bg-foreground/[0.06]">
                  {a.image ? (
                    <img src={a.image} alt="" loading="lazy" className="size-20 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-orange-500/12 text-orange-600">
                      <Camera className="size-7" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-semibold">{a.name}</span>
                    <span className="block pt-1 text-[0.875rem] tabular-nums">from {formatMoney(a.priceMinor, a.currency)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ResultsState>
      ) : null}
    </div>
  )
}
