import { useState } from 'react'
import { ChevronLeft, Plane } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useTrip } from '@/features/trips/TripContext'
import { api, callableMessage } from '@/lib/functions'
import type { Item } from '@/lib/firestore'
import { formatMoney } from '@/shared/money'
import { formatShortDate, formatTime } from '@/shared/dates'
import type { FlightLeg, FlightOffer, PlaceOption } from '@/shared/booking'
import { PlaceField } from './PlaceField'
import { BookActions, ResultsState, Stepper } from './shared'
import { addFlight } from './addToItinerary'

const hm = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`
const t = (iso: string) => formatTime(iso.slice(11, 16))

/** One direction of a trip: its legs, overall times and stop count. */
function journeys(f: FlightOffer): { label: string; legs: FlightLeg[] }[] {
  const out = f.legs.filter((l) => l.direction === 0)
  const back = f.legs.filter((l) => l.direction === 1)
  return back.length ? [{ label: 'Outbound', legs: out }, { label: 'Return', legs: back }] : [{ label: 'Flight', legs: out }]
}

function Summary({ legs }: { legs: FlightLeg[] }) {
  const a = legs[0]!
  const b = legs[legs.length - 1]!
  const stops = legs.length - 1
  const dayShift = b.arrive.slice(0, 10) !== a.depart.slice(0, 10)
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="font-semibold whitespace-nowrap tabular-nums">
        {t(a.depart)} – {t(b.arrive)}
        {dayShift && <sup className="ml-0.5 text-[0.6875rem] font-medium text-muted-foreground">+1</sup>}
      </span>
      <span className="text-[0.8125rem] whitespace-nowrap text-muted-foreground">
        {a.from}→{b.to} · {stops === 0 ? 'Nonstop' : `${stops} stop${stops > 1 ? 's' : ''}`}
      </span>
    </span>
  )
}

export function FlightPanel({ items, onDone }: { items: Item[]; onDone(): void }) {
  const { trip, me, members } = useTrip()
  const [from, setFrom] = useState<PlaceOption | null>(null)
  const [to, setTo] = useState<PlaceOption | null>(null)
  const [returnTrip, setReturnTrip] = useState(true)
  const [date, setDate] = useState(trip.startDate)
  const [returnDate, setReturnDate] = useState(trip.endDate)
  const [adults, setAdults] = useState(Math.max(1, members.length))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<FlightOffer[] | null>(null)
  const [picked, setPicked] = useState<FlightOffer | null>(null)

  async function search() {
    if (!from || !to) return setError('Choose where you’re flying from and to.')
    setBusy(true)
    setError(null)
    try {
      const res = await api.booking({ action: 'flights', tripId: trip.id, from: from.id, to: to.id, date, returnDate: returnTrip ? returnDate : null, adults, cabin: 'Economy' })
      setResults(res.flights ?? [])
    } catch (err) {
      setError(callableMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (picked) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setPicked(null)} className="inline-flex h-11 items-center text-[1.0625rem] text-primary">
          <ChevronLeft className="size-6" aria-hidden /> Flights
        </button>
        {journeys(picked).map((j) => (
          <section key={j.label} aria-label={j.label}>
            <h3 className="px-4 pb-1.5 text-[0.8125rem] font-medium text-muted-foreground uppercase">
              {j.label} · {formatShortDate(j.legs[0]!.depart.slice(0, 10))}
            </h3>
            <ol className="divide-y divide-border/70 overflow-hidden rounded-2xl bg-card ring-1 ring-border/70">
              {j.legs.map((l, i) => (
                <li key={i} className="px-4 py-3">
                  <p className="font-semibold">
                    {t(l.depart)} {l.from} → {t(l.arrive)} {l.to}
                  </p>
                  <p className="text-[0.875rem] text-muted-foreground">
                    {l.airline} {l.flightNumber} · {hm(l.durationMin)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ))}
        <p className="text-[0.875rem] text-muted-foreground">
          {picked.cabin}
          {picked.baggage && ` · checked bag ${picked.baggage}`}
          {picked.seatsLeft !== null && picked.seatsLeft < 9 && ` · ${picked.seatsLeft} seats left`} · total for {adults} {adults === 1 ? 'adult' : 'adults'}
        </p>
        <BookActions
          kind="flight"
          bookRef={picked.ref}
          priceLabel={formatMoney(picked.priceMinor, picked.currency)}
          onAdd={async () => {
            await addFlight(trip, me, items, picked).then(
              () => {
                toast.success('Flight added to the itinerary')
                onDone()
              },
              () => toast.error('Couldn’t add it'),
            )
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ToggleGroup type="single" value={returnTrip ? 'return' : 'oneway'} onValueChange={(v) => v && setReturnTrip(v === 'return')} className="w-full" aria-label="Trip type">
        <ToggleGroupItem value="return">Return</ToggleGroupItem>
        <ToggleGroupItem value="oneway">One way</ToggleGroupItem>
      </ToggleGroup>
      <PlaceField id="fl-from" label="From" kind="flight" tripId={trip.id} value={from} onChange={setFrom} placeholder="City or airport" />
      <PlaceField id="fl-to" label="To" kind="flight" tripId={trip.id} value={to} onChange={setTo} initialQuery={trip.destination.split(',')[0] ?? ''} placeholder="City or airport" />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="fl-date">Depart</Label>
          <Input id="fl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {returnTrip ? (
          <div className="space-y-2">
            <Label htmlFor="fl-ret">Return</Label>
            <Input id="fl-ret" type="date" min={date} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </div>
        ) : (
          <Stepper id="fl-adults" label="Travellers" value={adults} onChange={setAdults} />
        )}
      </div>
      {returnTrip && <Stepper id="fl-adults2" label="Travellers" value={adults} onChange={setAdults} />}
      <Button size="lg" className="w-full" onClick={search} disabled={busy}>
        Search flights
      </Button>
      {results !== null || busy || error ? (
        <ResultsState busy={busy} error={error} empty={results?.length === 0}>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl bg-card ring-1 ring-border/70">
            {results?.map((f) => {
              return (
                <li key={f.id}>
                  <button type="button" onClick={() => setPicked(f)} className="block w-full space-y-1 px-4 py-3 text-left active:bg-foreground/[0.06]">
                    <span className="flex items-center gap-2">
                      <Plane className="size-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[0.875rem] text-muted-foreground">{f.legs[0]!.airline}</span>
                      <span className="text-[1.0625rem] font-semibold tabular-nums">{formatMoney(f.priceMinor, f.currency)}</span>
                    </span>
                    {journeys(f).map((j) => (
                      <Summary key={j.label} legs={j.legs} />
                    ))}
                  </button>
                </li>
              )
            })}
          </ul>
        </ResultsState>
      ) : null}
    </div>
  )
}
