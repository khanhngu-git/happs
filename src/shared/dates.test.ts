import { describe, expect, it } from 'vitest'
import { addDays, formatDateRange, formatTime, isDateString, todayInZone, tripDays, tripPhase } from './dates'
import { compareItems, itemsForDay, reorder, staysForDay, type ItineraryItemLike } from './itinerary'

describe('dates', () => {
  it('does calendar arithmetic on strings', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(tripDays('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(isDateString('2026-13-01')).toBe(false)
  })
  it('evaluates "today" in the trip time zone, not the device', () => {
    const instant = new Date('2026-05-01T20:00:00Z') // 04:00 next day in Shanghai
    expect(todayInZone('Asia/Shanghai', instant)).toBe('2026-05-02')
    expect(todayInZone('America/Los_Angeles', instant)).toBe('2026-05-01')
    expect(tripPhase({ startDate: '2026-05-02', endDate: '2026-05-05', timeZone: 'Asia/Shanghai' }, instant)).toBe('ongoing')
    expect(tripPhase({ startDate: '2026-05-02', endDate: '2026-05-05', timeZone: 'America/Los_Angeles' }, instant)).toBe('upcoming')
  })
  it('formats', () => {
    expect(formatTime('09:05')).toBe('9:05 am')
    expect(formatTime('00:30')).toBe('12:30 am')
    expect(formatTime('13:00')).toBe('1:00 pm')
    expect(formatDateRange('2026-05-02', '2026-05-09')).toBe('2 May – 9 May 2026')
  })
})

const item = (p: Partial<ItineraryItemLike> & { id: string }): ItineraryItemLike => ({
  type: 'activity',
  title: p.id,
  date: '2026-05-02',
  startTime: null,
  order: 0,
  checkIn: null,
  checkOut: null,
  ...p,
})

describe('itinerary ordering', () => {
  it('puts untimed first by order, then timed by start time', () => {
    const items = [
      item({ id: 'lunch', startTime: '12:00' }),
      item({ id: 'b', order: 2000 }),
      item({ id: 'breakfast', startTime: '08:30' }),
      item({ id: 'a', order: 1000 }),
      item({ id: 'other-day', date: '2026-05-03' }),
    ]
    expect(itemsForDay(items, '2026-05-02').map((i) => i.id)).toEqual(['a', 'b', 'breakfast', 'lunch'])
    expect(compareItems(items[0]!, items[2]!)).toBeGreaterThan(0)
  })
  it('reorders untimed items', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(reorder(list, 2, 0)).toEqual([
      { id: 'c', order: 1000 },
      { id: 'a', order: 2000 },
      { id: 'b', order: 3000 },
    ])
  })
  it('stays cover each night between check-in and check-out', () => {
    const hotel = item({ id: 'hotel', type: 'stay', checkIn: { date: '2026-05-02', time: '15:00' }, checkOut: { date: '2026-05-05', time: '10:00' } })
    expect(staysForDay([hotel], '2026-05-01')).toEqual([])
    expect(staysForDay([hotel], '2026-05-02')[0]).toMatchObject({ sleeping: true, checkingIn: true, checkingOut: false })
    expect(staysForDay([hotel], '2026-05-04')[0]).toMatchObject({ sleeping: true, checkingIn: false })
    expect(staysForDay([hotel], '2026-05-05')[0]).toMatchObject({ sleeping: false, checkingOut: true })
  })
})
