import { describe, expect, it } from 'vitest'
import { parseSeed, SeedError } from './seed'

const trip = { name: 'China Trip 2026', destination: 'Haikou', startDate: '2026-11-24', endDate: '2026-12-14', timeZone: 'Asia/Shanghai', baseCurrency: 'AUD', notes: 'Group of 6.' }
const seed = (items: unknown[], over: Record<string, unknown> = {}) => JSON.stringify({ trip: { ...trip, ...over }, items })

describe('parseSeed', () => {
  it('maps a named place to a lookup and keeps its Chinese name', () => {
    const { items } = parseSeed(
      seed([
        {
          id: 'act-qilou',
          type: 'activity',
          title: 'Qilou Old Street',
          date: '2026-11-25',
          startTime: '16:45',
          endTime: '19:00',
          location: { name: 'Qilou Old Street', nameZh: '海口骑楼老街', address: 'No. 31 Bo’ai North Road, Haikou, Hainan, China', placeId: null, lat: null, lng: null },
          notes: 'Free.',
          tripComUrl: 'https://www.trip.com/x',
          bookingUrl: null,
          status: 'planned',
          bookingRequired: false,
        },
      ]),
    )
    const i = items[0]!
    expect(i.id).toBe('act-qilou')
    expect(i.values.location).toMatchObject({ name: 'Qilou Old Street', localName: '海口骑楼老街', lat: null, lng: null })
    expect(i.values.bookingUrl).toBe('https://www.trip.com/x')
    expect(i.values.meta).toMatchObject({ status: 'planned', bookingRequired: false, todo: [] })
    expect(i.lookup).toEqual({ query: 'Qilou Old Street, No. 31 Bo’ai North Road, Haikou, Hainan, China', fallback: '海口骑楼老街, No. 31 Bo’ai North Road, Haikou, Hainan, China', country: 'China' })
  })

  it('never looks up an unnamed place, and keeps unknowns as Missing info', () => {
    const { items } = parseSeed(
      seed([
        {
          id: 'stay-chongqing',
          type: 'stay',
          title: 'Chongqing hotel',
          date: '2026-12-10',
          checkIn: { date: '2026-12-10', time: null },
          checkOut: { date: '2026-12-13', time: null },
          location: { name: null, nameZh: null, address: 'Yuzhong District, Chongqing, China', placeId: null, lat: null, lng: null },
          notes: 'Booked.',
          bookingRef: null,
          status: 'booked',
          todo: ['hotel name', 'booking reference'],
        },
        { id: 'trn-x', type: 'transport', title: 'Train', date: '2026-12-10', location: { name: null, address: null }, status: 'booked' },
      ]),
    )
    expect(items[0]!.lookup).toBeNull()
    expect(items[0]!.values.location).toMatchObject({ name: 'Yuzhong District, Chongqing, China', lat: null })
    expect(items[0]!.values).toMatchObject({ checkIn: { date: '2026-12-10', time: null }, checkOut: { date: '2026-12-13', time: null }, endTime: null })
    expect(items[0]!.values.meta.todo).toEqual(['hotel name', 'booking reference'])
    expect(items[1]!.values.location).toBeNull()
  })

  it('keeps a plan’s own time zone and alternatives in meta', () => {
    const { items } = parseSeed(
      seed([
        { id: 'flt', type: 'transport', title: 'Flight', date: '2026-11-24', timeZone: 'Australia/Melbourne', location: null },
        { id: 'food', type: 'food', title: 'Chicken rice', date: '2026-11-25', alternatives: [{ name: 'Yanjiang', nameZh: '沿江饭店', tripComUrl: 'https://t' }] },
      ]),
    )
    expect(items[0]!.values.meta.timeZone).toBe('Australia/Melbourne')
    expect(items[1]!.values.meta.alternatives).toEqual([{ name: 'Yanjiang', nameZh: '沿江饭店', address: null, url: 'https://t' }])
  })

  it('rejects bad files with a readable reason', () => {
    expect(() => parseSeed('{')).toThrow(SeedError)
    expect(() => parseSeed(seed([{ id: 'a', type: 'activity', title: 'x', date: '2027-01-01' }]))).toThrow(/outside the trip/)
    expect(() => parseSeed(seed([{ id: 'a', type: 'activity', title: 'x', date: '2026-11-25' }, { id: 'a', type: 'food', title: 'y', date: '2026-11-25' }]))).toThrow(/share the id/)
    expect(() => parseSeed(seed([{ id: 'a/b', type: 'activity', title: 'x', date: '2026-11-25' }]))).toThrow(SeedError)
  })
})
