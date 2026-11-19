import { describe, expect, it } from 'vitest'
import { dayLines, findOverlaps, itemsOutsideTrip, localDateHour, nowAndNext } from './itinerary'

type T = Parameters<typeof findOverlaps>[0][number]
const item = (id: string, date: string, startTime: string | null, endTime: string | null = null, type: T['type'] = 'activity'): T => ({
  id,
  type,
  title: id,
  date,
  startTime,
  endTime,
  order: 0,
  checkIn: type === 'stay' ? { date, time: startTime } : null,
  checkOut: null,
})

const D = '2026-12-06'

describe('findOverlaps', () => {
  const items = [item('museum', D, '09:00', '11:00'), item('lunch', D, '12:00'), item('hotel', D, '10:00', null, 'stay'), item('other-day', '2026-12-07', '09:30', '10:30')]

  it('finds timed plans that clash on the same day', () => {
    expect(findOverlaps(items, { date: D, startTime: '10:30', endTime: '12:30' }).map((i) => i.id)).toEqual(['museum', 'lunch'])
  })
  it('ignores stays, other days, anytime candidates and the plan being edited', () => {
    expect(findOverlaps(items, { date: D, startTime: '13:00', endTime: '14:00' })).toEqual([])
    expect(findOverlaps(items, { date: D, startTime: null, endTime: null })).toEqual([])
    expect(findOverlaps(items, { id: 'museum', date: D, startTime: '09:30', endTime: '10:00' })).toEqual([])
  })
  it('back-to-back plans do not clash, same start time does', () => {
    expect(findOverlaps(items, { date: D, startTime: '11:00', endTime: '11:30' })).toEqual([])
    expect(findOverlaps(items, { date: D, startTime: '12:00', endTime: null }).map((i) => i.id)).toEqual(['lunch'])
  })
})

describe('nowAndNext', () => {
  const items = [item('museum', D, '09:00', '11:00'), item('lunch', D, '12:00'), item('anytime', D, null), item('dinner', D, '19:00', '21:00')]

  it('reports the current plan and the next one with a countdown', () => {
    expect(nowAndNext(items, D, '10:15')).toMatchObject({ now: { id: 'museum' }, next: { id: 'lunch' }, minutesToNext: 105 })
  })
  it('treats a plan without an end time as lasting an hour', () => {
    expect(nowAndNext(items, D, '12:59').now?.id).toBe('lunch')
    expect(nowAndNext(items, D, '13:00').now).toBeNull()
  })
  it('has nothing next after the last plan', () => {
    expect(nowAndNext(items, D, '22:00')).toEqual({ now: null, next: null, minutesToNext: null })
  })
})

describe('itemsOutsideTrip', () => {
  it('lists plans dated before or after the trip, in date order', () => {
    const items = [item('late', '2027-01-02', null), item('in', '2026-12-06', null), item('early', '2026-11-30', '08:00')]
    expect(itemsOutsideTrip(items, '2026-12-05', '2026-12-09').map((i) => i.id)).toEqual(['early', 'late'])
  })
})

describe('localDateHour', () => {
  it('reads the date and hour in the trip time zone', () => {
    expect(localDateHour('Asia/Shanghai', new Date('2026-12-05T10:30:00Z'))).toEqual({ date: '2026-12-05', hour: 18 })
    expect(localDateHour('America/Los_Angeles', new Date('2026-12-05T07:00:00Z'))).toEqual({ date: '2026-12-04', hour: 23 })
  })
})

describe('dayLines', () => {
  const fmt = (t: string) => t
  it('lists check-outs, timed plans, anytime plans and check-ins, capped', () => {
    const items = [
      { ...item('old-hotel', '2026-12-03', null, null, 'stay'), checkOut: { date: '2026-12-05', time: '10:00' } },
      { ...item('new-hotel', '2026-12-05', '15:00', null, 'stay') },
      item('museum', '2026-12-05', '11:00'),
      item('stroll', '2026-12-05', null),
    ]
    expect(dayLines(items, '2026-12-05', fmt, 10)).toEqual(['Check out of old-hotel by 10:00', '11:00 museum', 'stroll', 'Check in to new-hotel at 15:00'])
    expect(dayLines(items, '2026-12-05', fmt, 3)).toEqual(['Check out of old-hotel by 10:00', '11:00 museum', 'and 2 more'])
    expect(dayLines(items, '2026-12-06', fmt)).toEqual([])
  })
})
