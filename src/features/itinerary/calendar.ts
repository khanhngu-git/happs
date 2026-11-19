/**
 * Calendar export (.ics, RFC 5545) so the plan sits in people's own calendar
 * app, with alerts and offline access they already rely on.
 *
 * Timed plans are written in UTC, converted from the trip's time zone, so a
 * 9:00 am museum visit in Tokyo shows at 9:00 am Tokyo time on any phone.
 * "Anytime" plans are all-day events; stays span check-in to check-out day.
 */
import { fromZonedTime } from 'date-fns-tz'
import { addDays } from '@/shared/dates'
import { DEFAULT_PLAN_MINUTES } from '@/shared/itinerary'

export interface CalendarItem {
  id: string
  type: string
  title: string
  date: string
  startTime: string | null
  endTime: string | null
  checkOut: { date: string; time: string | null } | null
  location: { name: string; address: string } | null
  notes: string
  bookingRef: string
  bookingUrl: string
}

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Lines longer than 75 characters continue on the next line after a space. */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  for (let i = 0; i < line.length; i += i === 0 ? 75 : 74) parts.push(line.slice(i, i + (i === 0 ? 75 : 74)))
  return parts.join('\r\n ')
}

const compactDate = (date: string) => date.replaceAll('-', '')
const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

function localToUtc(date: string, time: string, timeZone: string): Date {
  return fromZonedTime(`${date}T${time}:00`, timeZone)
}

export function buildIcs(trip: { id: string; name: string; timeZone: string }, items: CalendarItem[], now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//happs//trip planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(trip.name)}`]
  for (const it of items) {
    lines.push('BEGIN:VEVENT', `UID:${it.id}@${trip.id}.happs`, `DTSTAMP:${utcStamp(now)}`, `SUMMARY:${escapeText(it.title)}`)
    if (it.type === 'stay') {
      // All-day across the nights, including the check-out day (DTEND is exclusive).
      const out = it.checkOut?.date && it.checkOut.date >= it.date ? it.checkOut.date : it.date
      lines.push(`DTSTART;VALUE=DATE:${compactDate(it.date)}`, `DTEND;VALUE=DATE:${compactDate(addDays(out, 1))}`)
    } else if (it.startTime) {
      const start = localToUtc(it.date, it.startTime, trip.timeZone)
      const end = it.endTime && it.endTime > it.startTime ? localToUtc(it.date, it.endTime, trip.timeZone) : new Date(start.getTime() + DEFAULT_PLAN_MINUTES * 60_000)
      lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(it.date)}`, `DTEND;VALUE=DATE:${compactDate(addDays(it.date, 1))}`)
    }
    if (it.location) lines.push(`LOCATION:${escapeText([it.location.name, it.location.address].filter(Boolean).join(', '))}`)
    const description = [it.notes, it.bookingRef && `Booking ref: ${it.bookingRef}`, it.bookingUrl].filter(Boolean).join('\n')
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`)
    if (it.bookingUrl) lines.push(`URL:${it.bookingUrl}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Save the .ics file; phones offer to add it to the calendar. */
export function downloadIcs(filename: string, ics: string): void {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'trip'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
