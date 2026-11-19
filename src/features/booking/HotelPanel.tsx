import { useState } from 'react'
import { BedDouble, ChevronLeft, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTrip } from '@/features/trips/TripContext'
import { api, callableMessage } from '@/lib/functions'
import type { Item } from '@/lib/firestore'
import { formatMoney } from '@/shared/money'
import type { HotelOffer, HotelRoom, PlaceOption } from '@/shared/booking'
import { PlaceField } from './PlaceField'
import { BookActions, ResultsState, Stepper } from './shared'
import { addStay } from './addToItinerary'

export function HotelPanel({ items, onDone }: { items: Item[]; onDone(): void }) {
  const { trip, me, members } = useTrip()
  const [place, setPlace] = useState<PlaceOption | null>(null)
  const [checkIn, setCheckIn] = useState(trip.startDate)
  const [checkOut, setCheckOut] = useState(trip.endDate)
  const [adults, setAdults] = useState(Math.max(1, members.length))
  const [rooms, setRooms] = useState(Math.max(1, Math.ceil(members.length / 2)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<HotelOffer[] | null>(null)
  const [hotel, setHotel] = useState<HotelOffer | null>(null)
  const [roomList, setRoomList] = useState<HotelRoom[] | null>(null)
  const [room, setRoom] = useState<HotelRoom | null>(null)

  async function search() {
    if (!place) return setError('Choose where you’re staying.')
    if (place.lat === null || place.lng === null) return setError('Pick a city or area from the list.')
    if (checkOut <= checkIn) return setError('Check-out must be after check-in.')
    setBusy(true)
    setError(null)
    try {
      const res = await api.booking({ action: 'hotels', tripId: trip.id, destination: { id: place.id, lat: place.lat, lng: place.lng, type: place.type }, checkIn, checkOut, adults, rooms })
      setResults(res.hotels ?? [])
    } catch (err) {
      setError(callableMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function openHotel(h: HotelOffer) {
    setHotel(h)
    setRoomList(null)
    setBusy(true)
    setError(null)
    try {
      const res = await api.booking({ action: 'hotelRooms', tripId: trip.id, hotel: h.ref as Record<string, unknown> })
      setRoomList(res.rooms ?? [])
    } catch (err) {
      setError(callableMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    if (!hotel) return
    await addStay(trip, me, items, { name: hotel.name, address: hotel.address, image: hotel.image, checkIn, checkOut }).then(
      () => {
        toast.success('Stay added to the itinerary')
        onDone()
      },
      () => toast.error('Couldn’t add it'),
    )
  }

  if (hotel && room) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setRoom(null)} className="inline-flex h-11 items-center text-[1.0625rem] text-primary">
          <ChevronLeft className="size-6" aria-hidden /> Rooms
        </button>
        <p className="text-xl font-bold">{hotel.name}</p>
        <p className="text-[0.9375rem]">
          {room.name}
          {room.board && ` · ${room.board}`}
          {room.refundable && ' · free cancellation'}
        </p>
        <BookActions kind="hotel" bookRef={room.ref} priceLabel={formatMoney(room.priceMinor, room.currency)} onAdd={add} />
      </div>
    )
  }

  if (hotel) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setHotel(null)} className="inline-flex h-11 items-center text-[1.0625rem] text-primary">
          <ChevronLeft className="size-6" aria-hidden /> Hotels
        </button>
        {hotel.image && <img src={hotel.image} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" />}
        <div>
          <p className="text-xl font-bold">{hotel.name}</p>
          {hotel.address && <p className="text-[0.9375rem] text-muted-foreground">{hotel.address}</p>}
        </div>
        <ResultsState busy={busy} error={error} empty={roomList?.length === 0}>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl bg-card ring-1 ring-border/70">
            {roomList?.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setRoom(r)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-foreground/[0.06]">
                  <span className="min-w-0 flex-1">
                    <span className="block">{r.name}</span>
                    <span className="flex flex-wrap gap-1.5 pt-0.5 text-[0.8125rem] text-muted-foreground">
                      {r.board}
                      {r.refundable && <Badge variant="success">Free cancellation</Badge>}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatMoney(r.priceMinor, r.currency)}</span>
                </button>
              </li>
            ))}
          </ul>
        </ResultsState>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PlaceField id="ho-place" label="Where" kind="hotel" tripId={trip.id} value={place} onChange={setPlace} initialQuery={trip.destination.split(',')[0] ?? ''} placeholder="City or area" />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="ho-in">Check in</Label>
          <Input id="ho-in" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ho-out">Check out</Label>
          <Input id="ho-out" type="date" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </div>
        <Stepper id="ho-adults" label="Guests" value={adults} max={16} onChange={setAdults} />
        <Stepper id="ho-rooms" label="Rooms" value={rooms} max={Math.min(8, adults)} onChange={setRooms} />
      </div>
      <Button size="lg" className="w-full" onClick={search} disabled={busy}>
        Search hotels
      </Button>
      {results !== null || busy || error ? (
        <ResultsState busy={busy} error={error} empty={results?.length === 0}>
          <ul className="space-y-2">
            {results?.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => openHotel(h)} className="flex w-full items-center gap-3 rounded-2xl bg-card p-2 text-left ring-1 ring-border/70 active:bg-foreground/[0.06]">
                  {h.image ? (
                    <img src={h.image} alt="" loading="lazy" className="size-20 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-600">
                      <BedDouble className="size-7" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{h.name}</span>
                    <span className="flex items-center gap-1 text-[0.875rem] text-muted-foreground">
                      {h.stars !== null && (
                        <>
                          <Star className="size-3.5 fill-current text-warning" aria-hidden /> {h.stars}
                        </>
                      )}
                      {h.rating !== null && ` · ${h.rating}${h.reviewCount ? ` (${h.reviewCount})` : ''}`}
                    </span>
                    <span className="block pt-1 font-semibold tabular-nums">{formatMoney(h.priceMinor, h.currency)}</span>
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
