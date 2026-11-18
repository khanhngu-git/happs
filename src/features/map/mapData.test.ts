import { describe, expect, it } from 'vitest'
import { mapStops } from './mapData'
import type { Item } from '@/lib/firestore'
import type { ItemType } from '@/shared/itinerary'

const item = (id: string, over: Partial<Item> = {}): Item =>
  ({
    id,
    path: `trips/t/items/${id}`,
    type: 'activity',
    title: id,
    date: '2026-12-06',
    startTime: null,
    endTime: null,
    checkIn: null,
    checkOut: null,
    location: { placeId: null, name: id, address: '', lat: 31, lng: 121 },
    notes: '',
    bookingUrl: '',
    bookingRef: '',
    order: 0,
    linkedExpenseId: null,
    createdBy: 'u',
    ...over,
  }) as Item

const ALL = new Set<ItemType>(['activity', 'food', 'transport', 'stay', 'other'])

describe('mapStops', () => {
  it('skips items without coordinates', () => {
    expect(mapStops([item('a', { location: null }), item('b')], null, ALL).map((s) => s.item.id)).toEqual(['b'])
  })
  it('numbers a single day in itinerary order, excluding stays', () => {
    const items = [
      item('dinner', { startTime: '19:00' }),
      item('hotel', { type: 'stay', date: '2026-12-05', checkIn: { date: '2026-12-05', time: null }, checkOut: { date: '2026-12-08', time: null } }),
      item('museum', { startTime: '10:00' }),
      item('walk'),
      item('other-day', { date: '2026-12-07' }),
    ]
    const stops = mapStops(items, '2026-12-06', ALL)
    expect(stops.map((s) => [s.item.id, s.number])).toEqual([
      ['hotel', null],
      ['walk', 1],
      ['museum', 2],
      ['dinner', 3],
    ])
  })
  it('filters by type and leaves numbers off for all days', () => {
    const stops = mapStops([item('a', { type: 'food' }), item('b')], null, new Set<ItemType>(['food']))
    expect(stops).toHaveLength(1)
    expect(stops[0]!.number).toBeNull()
  })
})
