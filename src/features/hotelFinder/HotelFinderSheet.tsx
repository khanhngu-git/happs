import { useEffect, useState } from 'react'
import { BedDouble, ChevronLeft, Loader2, MapPin, Minus, Plus, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTrip } from '@/features/trips/TripContext'
import type { ItemPrefill } from '@/features/itinerary/prefill'
import { api, callableMessage } from '@/lib/functions'
import { formatMoney } from '@/shared/money'
import { diffDays } from '@/shared/dates'
import type { HotelResult } from '@/shared/hotelFinder'
import { locateHotel } from './geocode'

function Stepper({ id, label, value, min = 1, max, onChange }: { id: string; label: string; value: number; min?: number; max: number; onChange(n: number): void }) {
  return (
    <div className="space-y-2">
      <Label id={id}>{label}</Label>
      <div className="flex h-11 items-center justify-between rounded-xl bg-card px-1 ring-1 ring-input" role="group" aria-labelledby={id}>
        <button type="button" className="inline-flex size-10 items-center justify-center rounded-full disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label.toLowerCase()}`}>
          <Minus className="size-4" />
        </button>
        <span className="text-[1.0625rem] font-semibold tabular-nums" aria-live="polite">
          {value}
        </span>
        <button type="button" className="inline-flex size-10 items-center justify-center rounded-full disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label.toLowerCase()}`}>
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}

const ratingLabel = (h: HotelResult) => (h.rating === null ? null : `${h.rating}${h.ratingScale ? `/${h.ratingScale}` : ''}${h.ratingText ? ` ${h.ratingText}` : ''}`)

/**
 * Find a hotel on Trip.com (scraped live via Apify) and turn it into an
 * itinerary stay with its dates, location, photo and price. Hands a prefill
 * to the normal form, so people review everything before saving.
 */
export function HotelFinderSheet({ open, onOpenChange, onPick }: { open: boolean; onOpenChange(o: boolean): void; day?: string; onPick(p: ItemPrefill): void }) {
  const { trip, me, members } = useTrip()
  const [destination, setDestination] = useState(trip.destination.split(',')[0]?.trim() ?? '')
  const [checkIn, setCheckIn] = useState(trip.startDate)
  const [checkOut, setCheckOut] = useState(trip.endDate > trip.startDate ? trip.endDate : '')
  const [adults, setAdults] = useState(Math.min(10, Math.max(1, members.length)))
  const [rooms, setRooms] = useState(Math.max(1, Math.ceil(members.length / 2)))
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<HotelResult[] | null>(null)
  const [hotel, setHotel] = useState<HotelResult | null>(null)
  const [adding, setAdding] = useState(false)
  const nights = checkIn && checkOut ? diffDays(checkOut, checkIn) : 0

  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [busy])

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (destination.trim().length < 2) return setError('Where are you staying?')
    if (!(nights > 0)) return setError('Check-out must be after check-in.')
    setBusy(true)
    setElapsed(0)
    setError(null)
    setResults(null)
    try {
      const res = await api.hotelFinder({ tripId: trip.id, destination: destination.trim(), checkIn, checkOut, adults, rooms: Math.min(rooms, adults) })
      setResults(res.hotels)
    } catch (err) {
      setError(callableMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function add(h: HotelResult) {
    setAdding(true)
    try {
      const location = await locateHotel(h.name, destination.trim(), h.area)
      const notes = [h.roomType, h.features.join(' · '), h.area, h.totalEstimated ? 'Price from Trip.com (nightly rate × nights; taxes may be extra)' : 'Price from Trip.com for the whole stay'].filter(Boolean).join('\n')
      onPick({
        type: 'stay',
        title: h.name,
        date: checkIn,
        checkOutDate: checkOut,
        startTime: null,
        location,
        photoURL: h.images[0] ?? null,
        notes,
        // Prefilled as a shared cost: paid by you, split equally. Editable before saving.
        cost: h.totalMinor !== null ? { amountMinor: h.totalMinor, currency: h.currency, fxRateToBase: 1, paidBy: me, splitMethod: 'equal', participantIds: members.map((m) => m.id), splitValues: null } : null,
      })
    } catch {
      toast.error('Couldn’t add that hotel. Try again.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {!hotel ? (
          <>
            <DialogHeader>
              <DialogTitle>Find a hotel</DialogTitle>
              <DialogDescription className="text-foreground/80">Live prices from Trip.com for your dates.</DialogDescription>
            </DialogHeader>
            <form onSubmit={search} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="hf-dest">Where</Label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input id="hf-dest" className="pl-9" value={destination} placeholder="City or area" onChange={(e) => setDestination(e.target.value)} enterKeyHint="search" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="hf-in">Check in</Label>
                  <Input id="hf-in" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hf-out">Check out</Label>
                  <Input id="hf-out" type="date" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
                </div>
                <Stepper id="hf-adults" label="Guests" value={adults} max={10} onChange={setAdults} />
                <Stepper id="hf-rooms" label="Rooms" value={Math.min(rooms, adults)} max={Math.min(8, adults)} onChange={setRooms} />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? 'Searching…' : `Search ${nights > 0 ? `${nights} night${nights === 1 ? '' : 's'}` : 'hotels'}`}
              </Button>
            </form>
            {busy && (
              <p className="flex items-center justify-center gap-2 py-6 text-[0.9375rem] text-muted-foreground" role="status">
                <Loader2 className="size-5 animate-spin" aria-hidden /> Checking Trip.com… {elapsed}s <span className="text-[0.8125rem]">(usually under a minute)</span>
              </p>
            )}
            {error && <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-[0.9375rem]" role="alert">{error}</p>}
            {results && results.length === 0 && <p className="py-6 text-center text-[0.9375rem] text-muted-foreground">No hotels found. Try a nearby city or other dates.</p>}
            {results && results.length > 0 && (
              <ul className="space-y-2">
                {results.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => setHotel(h)} className="flex w-full items-center gap-3 rounded-2xl bg-card p-2 text-left ring-1 ring-border/70 active:bg-foreground/[0.06]">
                      {h.images[0] ? (
                        <img src={h.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-20 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-600">
                          <BedDouble className="size-7" aria-hidden />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 font-semibold">{h.name}</span>
                        <span className="flex items-center gap-1 text-[0.8125rem] text-muted-foreground">
                          {h.stars !== null && (
                            <>
                              <Star className="size-3 fill-current text-warning" aria-hidden /> {h.stars}
                            </>
                          )}
                          {ratingLabel(h) && <span className="truncate">{h.stars !== null && ' · '}{ratingLabel(h)}</span>}
                        </span>
                        <span className="block pt-0.5 text-[0.9375rem]">
                          <span className="font-semibold tabular-nums">{formatMoney(h.totalMinor!, h.currency)}</span>
                          <span className="text-[0.8125rem] text-muted-foreground"> total{h.totalEstimated ? ' (est.)' : ''}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <button type="button" onClick={() => setHotel(null)} className="inline-flex h-11 items-center pr-10 text-[1.0625rem] text-primary">
              <ChevronLeft className="size-6" aria-hidden /> Hotels
            </button>
            {hotel.images.length > 0 && (
              <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 [scrollbar-width:none]">
                {hotel.images.map((src, i) => (
                  <img key={src} src={src} alt={i === 0 ? hotel.name : ''} referrerPolicy="no-referrer" className="aspect-[4/3] w-[85%] shrink-0 snap-center rounded-2xl object-cover" />
                ))}
              </div>
            )}
            <div>
              <DialogTitle className="text-xl font-bold">{hotel.name}</DialogTitle>
              <DialogDescription className="text-[0.875rem]">
                {[hotel.stars ? `${hotel.stars}-star` : null, ratingLabel(hotel), hotel.reviews ? `${hotel.reviews.toLocaleString()} reviews` : null].filter(Boolean).join(' · ')}
              </DialogDescription>
            </div>
            {hotel.area && (
              <p className="flex gap-2 text-[0.9375rem]">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {hotel.area}
              </p>
            )}
            <div className="rounded-2xl bg-card p-4 ring-1 ring-border/70">
              {hotel.roomType && <p className="font-semibold">{hotel.roomType}</p>}
              {hotel.features.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {hotel.features.map((f) => (
                    <Badge key={f} variant="secondary">
                      {f}
                    </Badge>
                  ))}
                </div>
              )}
              <p className="pt-3 text-[1.0625rem]">
                <span className="font-bold tabular-nums">{formatMoney(hotel.totalMinor!, hotel.currency)}</span>
                <span className="text-muted-foreground">
                  {' '}
                  for {nights} night{nights === 1 ? '' : 's'}
                  {hotel.nightlyMinor !== null && ` · ${formatMoney(hotel.nightlyMinor, hotel.currency)}/night`}
                </span>
              </p>
              {hotel.totalEstimated && <p className="text-[0.8125rem] text-muted-foreground">Estimated from the nightly rate; taxes may be extra.</p>}
            </div>
            <Button size="lg" className="w-full" disabled={adding} onClick={() => add(hotel)}>
              {adding ? <Loader2 className="animate-spin" /> : null} Add stay to itinerary
            </Button>
            <p className="text-center text-[0.8125rem] text-muted-foreground">Book on Trip.com or anywhere you like. The price is added as a shared cost you can edit.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
