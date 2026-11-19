import { saveItem, type ItemValues } from '@/features/itinerary/itineraryApi'
import type { Item, Trip } from '@/lib/firestore'
import type { FlightOffer } from '@/shared/booking'
import type { ItemType } from '@/shared/itinerary'

const base = (p: Partial<ItemValues> & { type: ItemType; title: string; date: string }): ItemValues => ({
  startTime: null,
  endTime: null,
  checkIn: null,
  checkOut: null,
  location: null,
  notes: '',
  bookingUrl: '',
  bookingRef: '',
  photoURL: null,
  ...p,
})

const nextOrder = (items: Item[]) => Math.max(0, ...items.map((i) => i.order)) + 1000

/** A return flight becomes two itinerary items: outbound and return. */
export async function addFlight(trip: Trip, uid: string, items: Item[], f: FlightOffer) {
  const groups = [f.legs.filter((l) => l.direction === 0), f.legs.filter((l) => l.direction === 1)].filter((g) => g.length > 0)
  let order = nextOrder(items)
  for (const legs of groups) {
    const first = legs[0]!
    const last = legs[legs.length - 1]!
    const sameDay = first.depart.slice(0, 10) === last.arrive.slice(0, 10)
    await saveItem({
      trip,
      uid,
      existing: null,
      cost: null,
      nextOrder: order,
      values: base({
        type: 'transport',
        // Short enough to read in a row; flight numbers live in the notes.
        title: `Flight ${first.from} → ${last.to}`,
        date: first.depart.slice(0, 10),
        startTime: first.depart.slice(11, 16) || null,
        endTime: sameDay ? last.arrive.slice(11, 16) || null : null,
        location: { placeId: null, name: last.toName || last.to, address: '', lat: null, lng: null },
        notes: legs.map((l) => `${l.airline} ${l.flightNumber}: ${l.from} ${l.depart.slice(11, 16)} → ${l.to} ${l.arrive.slice(11, 16)}`).join('\n') + '\nBooked via RouteStack',
      }),
    })
    order += 1000
  }
}

export async function addStay(trip: Trip, uid: string, items: Item[], h: { name: string; address: string | null; image: string | null; checkIn: string; checkOut: string }) {
  await saveItem({
    trip,
    uid,
    existing: null,
    cost: null,
    nextOrder: nextOrder(items),
    values: base({
      type: 'stay',
      title: h.name,
      date: h.checkIn,
      checkIn: { date: h.checkIn, time: null },
      checkOut: { date: h.checkOut, time: null },
      location: { placeId: null, name: h.name, address: h.address ?? '', lat: null, lng: null },
      photoURL: h.image,
      notes: 'Booked via RouteStack',
    }),
  })
}

export async function addActivity(trip: Trip, uid: string, items: Item[], a: { name: string; date: string; startTime: string | null; image: string | null; place: string | null }) {
  await saveItem({
    trip,
    uid,
    existing: null,
    cost: null,
    nextOrder: nextOrder(items),
    values: base({
      type: 'activity',
      title: a.name,
      date: a.date,
      startTime: a.startTime,
      photoURL: a.image,
      location: a.place ? { placeId: null, name: a.place, address: '', lat: null, lng: null } : null,
      notes: 'Booked via RouteStack',
    }),
  })
}
