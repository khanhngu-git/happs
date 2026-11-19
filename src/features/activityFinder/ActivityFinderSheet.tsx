import { useEffect, useState } from 'react'
import { Camera, ChevronLeft, MapPin, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTrip } from '@/features/trips/TripContext'
import type { ItemPrefill } from '@/features/itinerary/prefill'
import { api, callableMessage } from '@/lib/functions'
import { cn } from '@/lib/utils'
import { formatTime } from '@/shared/dates'
import type { ActivityDetails, ActivityOffer, DisplayPrice, PlaceOption } from '@/shared/activityFinder'
import { PlaceField } from './PlaceField'
import { Price, ResultsState, Stepper } from './ui'

type Activity = ActivityOffer & { display: DisplayPrice }
type Option = ActivityDetails['options'][number]

/**
 * Find a real activity (RouteStack) and turn it into an itinerary entry with
 * its price, meeting point and photo. Hands a prefill to the normal activity
 * form, so people review everything before it's saved.
 */
export function ActivityFinderSheet({ open, onOpenChange, day, onPick }: { open: boolean; onOpenChange(o: boolean): void; day: string; onPick(p: ItemPrefill): void }) {
  const { trip, me, members } = useTrip()
  const [query, setQuery] = useState('')
  const [place, setPlace] = useState<PlaceOption | null>(null)
  const [date, setDate] = useState(day)
  const [adults, setAdults] = useState(Math.max(1, members.length))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Activity[] | null>(null)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [details, setDetails] = useState<ActivityDetails | null>(null)
  const [choice, setChoice] = useState<{ option: Option; time: string | null } | null>(null)

  // Start "In" at the trip's destination (first match), so a name search is local by default.
  const destinationText = trip.destination.split(',')[0]?.trim() ?? ''
  useEffect(() => {
    if (!open || place || destinationText.length < 3) return
    let cancelled = false
    api
      .activityFinder({ action: 'places', tripId: trip.id, term: destinationText })
      .then((r) => !cancelled && r.places?.[0] && setPlace(r.places[0]))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function search(e?: React.FormEvent) {
    e?.preventDefault()
    if (query.trim().length < 2 && !place) return setError('Type an activity name or choose a place.')
    setBusy(true)
    setError(null)
    setActivity(null)
    try {
      const res = await api.activityFinder({ action: 'search', tripId: trip.id, query: query.trim(), destinationId: place?.id ?? null, date })
      setResults(res.activities ?? [])
    } catch (err) {
      setError(callableMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function openActivity(a: Activity) {
    setActivity(a)
    setDetails(null)
    setChoice(null)
    setBusy(true)
    setError(null)
    try {
      const res = await api.activityFinder({ action: 'details', tripId: trip.id, activityCode: a.code, date, adults })
      setDetails({ options: res.options ?? [], location: res.location ?? null, photos: res.photos ?? [], summary: res.summary ?? null, cancellation: res.cancellation ?? null })
    } catch (err) {
      setError(callableMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function addToItinerary() {
    if (!activity || !details) return
    const opt = choice?.option ?? null
    const price = opt?.display ?? null
    const notes = [opt?.title, opt?.description, details.summary, details.cancellation && `Cancellation: ${details.cancellation}`].filter(Boolean).join('\n\n')
    onPick({
      type: 'activity',
      title: activity.name,
      date,
      startTime: choice?.time ?? null,
      location: details.location,
      photoURL: details.photos[0] ?? activity.image,
      notes,
      // Prefilled as a shared cost: paid by you, split equally. Editable in the form before saving.
      cost: price
        ? { amountMinor: price.priceMinor, currency: price.currency, fxRateToBase: 1, paidBy: me, splitMethod: 'equal', participantIds: members.map((m) => m.id), splitValues: null }
        : null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {!activity ? (
          <>
            <DialogHeader>
              <DialogTitle>Find an activity</DialogTitle>
              <DialogDescription className="text-foreground/80">Search by name, like “teamLab” or “sushi class”, or browse a place.</DialogDescription>
            </DialogHeader>
            <form onSubmit={search} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="af-q">Activity</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input id="af-q" className="pl-9" placeholder="Name or keyword (optional)" value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" />
                </div>
              </div>
              <PlaceField id="af-in" label="In" tripId={trip.id} value={place} onChange={setPlace} placeholder="City or region" />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="af-date">Date</Label>
                  <Input id="af-date" type="date" min={trip.startDate} max={trip.endDate} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <Stepper id="af-adults" label="People" value={adults} max={20} onChange={setAdults} />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                Search
              </Button>
            </form>
            {(results !== null || busy || error) && (
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
                          <span className="block pt-0.5 text-[0.8125rem] text-muted-foreground">
                            {[a.duration, a.rating ? `★ ${a.rating}` : null, a.freeCancellation ? 'Free cancellation' : null].filter(Boolean).join(' · ')}
                          </span>
                          <span className="flex items-baseline gap-1 pt-0.5 text-[0.875rem]">
                            from <Price item={a} suffix="pp" className="items-start text-left" />
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </ResultsState>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <button type="button" onClick={() => setActivity(null)} className="inline-flex h-11 items-center pr-10 text-[1.0625rem] text-primary">
              <ChevronLeft className="size-6" aria-hidden /> Results
            </button>
            {(details?.photos[0] ?? activity.image) && <img src={details?.photos[0] ?? activity.image ?? ''} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" />}
            <div>
              <DialogTitle className="text-xl font-bold">{activity.name}</DialogTitle>
              <DialogDescription className="text-[0.875rem]">
                {[activity.duration, activity.rating ? `★ ${activity.rating}${activity.reviewCount ? ` (${activity.reviewCount.toLocaleString()})` : ''}` : null].filter(Boolean).join(' · ')}
              </DialogDescription>
            </div>
            <ResultsState busy={busy} error={error} empty={false}>
              {details && (
                <div className="space-y-4">
                  {details.location && (
                    <p className="flex gap-2 text-[0.9375rem]">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <span>
                        <span className="block font-medium">{details.location.name}</span>
                        {details.location.address && <span className="block text-muted-foreground">{details.location.address}</span>}
                      </span>
                    </p>
                  )}
                  {details.summary && <p className="line-clamp-4 text-[0.9375rem] text-muted-foreground">{details.summary}</p>}
                  {details.options.length === 0 ? (
                    <p className="rounded-2xl bg-foreground/[0.05] px-4 py-3 text-[0.9375rem]">No times on this date. You can still add it and set the time yourself.</p>
                  ) : (
                    <div className="space-y-2" role="radiogroup" aria-label="Options">
                      {details.options.map((o) => (
                        <div key={o.gradeCode} className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-border/70">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold">{o.title ?? 'Standard option'}</p>
                              {o.description && <p className="text-[0.875rem] text-muted-foreground">{o.description}</p>}
                            </div>
                            <Price item={o} className="shrink-0" />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(o.startTimes.length ? o.startTimes : [null]).map((time) => {
                              const on = choice?.option.gradeCode === o.gradeCode && choice.time === time
                              return (
                                <button
                                  key={time ?? 'any'}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  onClick={() => setChoice({ option: o, time })}
                                  className={cn('min-h-11 rounded-full px-4 text-[0.9375rem] font-medium', on ? 'bg-foreground text-background' : 'bg-foreground/[0.07]')}
                                >
                                  {time ? formatTime(time) : 'Any time'}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                      <p className="text-[0.8125rem] text-muted-foreground">Prices are totals for {adults} {adults === 1 ? 'person' : 'people'}.</p>
                    </div>
                  )}
                  {details.cancellation && <p className="rounded-2xl bg-success/10 px-4 py-3 text-[0.875rem]">{details.cancellation}</p>}
                  <Button size="lg" className="w-full" disabled={details.options.length > 0 && !choice} onClick={addToItinerary}>
                    {details.options.length > 0 && !choice ? 'Choose an option and time' : 'Add to itinerary'}
                  </Button>
                </div>
              )}
            </ResultsState>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
