import { describe, expect, it } from 'vitest'
import { arcPath, mapStops } from './mapData'
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
  it('numbers only timed stops, in time order; anytime plans and stays are unnumbered', () => {
    const items = [
      item('dinner', { startTime: '19:00' }),
      item('hotel', { type: 'stay', date: '2026-12-05', checkIn: { date: '2026-12-05', time: null }, checkOut: { date: '2026-12-08', time: null } }),
      item('museum', { startTime: '10:00' }),
      item('walk'),
      item('other-day', { date: '2026-12-07' }),
    ]
    const stops = mapStops(items, '2026-12-06', ALL)
    expect(stops.map((s) => [s.item.id, s.number])).toEqual([
      ['museum', 1],
      ['dinner', 2],
      ['hotel', null],
      ['walk', null],
    ])
  })
  it('filters by type and leaves numbers off for all days', () => {
    const stops = mapStops([item('a', { type: 'food' }), item('b')], null, new Set<ItemType>(['food']))
    expect(stops).toHaveLength(1)
    expect(stops[0]!.number).toBeNull()
  })
})

describe('arcPath', () => {
  it('starts and ends on the two places and bows away from the straight line', () => {
    const a = { lat: -37.67, lng: 144.84 } // Melbourne
    const b = { lat: 19.93, lng: 110.46 } // Haikou
    const p = arcPath(a, b)
    expect(p[0]).toEqual(a)
    expect(p.at(-1)!.lat).toBeCloseTo(b.lat)
    expect(p.at(-1)!.lng).toBeCloseTo(b.lng)
    const mid = p[Math.floor(p.length / 2)]!
    const straight = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
    expect(Math.hypot(mid.lat - straight.lat, mid.lng - straight.lng)).toBeGreaterThan(5)
  })
  it('never goes the long way round the world', () => {
    const p = arcPath({ lat: 35, lng: 170 }, { lat: 40, lng: -170 })
    expect(Math.max(...p.map((x) => x.lng)) - Math.min(...p.map((x) => x.lng))).toBeLessThan(30)
  })
})
