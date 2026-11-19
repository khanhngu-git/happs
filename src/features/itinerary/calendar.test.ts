import { describe, expect, it } from 'vitest'
import { buildIcs, type CalendarItem } from './calendar'

const base: Omit<CalendarItem, 'id' | 'type' | 'title' | 'date' | 'startTime'> = { endTime: null, checkOut: null, location: null, notes: '', bookingRef: '', bookingUrl: '' }
const trip = { id: 'trip1', name: 'Tokyo, with friends', timeZone: 'Asia/Tokyo' }
const now = new Date('2026-11-19T00:00:00Z')

describe('buildIcs', () => {
  it('writes timed plans in UTC from the trip time zone, with a one-hour default length', () => {
    const ics = buildIcs(trip, [{ ...base, id: 'a', type: 'activity', title: 'Sushi', date: '2026-12-06', startTime: '08:00' }], now)
    // 08:00 in Tokyo (UTC+9) is 23:00 UTC the day before.
    expect(ics).toContain('DTSTART:20261205T230000Z')
    expect(ics).toContain('DTEND:20261206T000000Z')
    expect(ics).toContain('UID:a@trip1.happs')
    expect(ics).toContain('X-WR-CALNAME:Tokyo\\, with friends')
    expect(ics.split('\r\n').at(-2)).toBe('END:VCALENDAR')
  })

  it('makes anytime plans all-day and stays span through check-out day', () => {
    const ics = buildIcs(
      trip,
      [
        { ...base, id: 'b', type: 'activity', title: 'Wander', date: '2026-12-06', startTime: null },
        { ...base, id: 'c', type: 'stay', title: 'Hotel', date: '2026-12-05', startTime: null, checkOut: { date: '2026-12-08', time: null } },
      ],
      now,
    )
    expect(ics).toContain('DTSTART;VALUE=DATE:20261206\r\nDTEND;VALUE=DATE:20261207')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261205\r\nDTEND;VALUE=DATE:20261209')
  })

  it('escapes text and folds long lines', () => {
    const notes = 'Line one; with, punctuation\nLine two ' + 'x'.repeat(100)
    const ics = buildIcs(trip, [{ ...base, id: 'd', type: 'food', title: 'Dinner', date: '2026-12-06', startTime: '19:00', notes, location: { name: 'Sukiyabashi', address: 'Ginza, Tokyo' } }], now)
    expect(ics).toContain('LOCATION:Sukiyabashi\\, Ginza\\, Tokyo')
    expect(ics).toContain('DESCRIPTION:Line one\\; with\\, punctuation\\nLine two')
    for (const line of ics.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75)
  })
})
