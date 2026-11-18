/**
 * Trip dates are stored as local "YYYY-MM-DD" / "HH:mm" strings in the trip's
 * time zone, so 9:00 in Shanghai stays 9:00 wherever the viewer is. These
 * helpers do calendar arithmetic on those strings without involving the
 * viewer's time zone.
 */
import { formatInTimeZone } from 'date-fns-tz'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export const isDateString = (s: string) => DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
export const isTimeString = (s: string) => TIME_RE.test(s)

/** Parse "YYYY-MM-DD" as a UTC midnight Date, purely for arithmetic. */
export function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

export function addDays(date: string, n: number): string {
  const d = utcDate(date)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function diffDays(a: string, b: string): number {
  return Math.round((utcDate(a).getTime() - utcDate(b).getTime()) / 86_400_000)
}

/** Every date from start to end inclusive. Capped to avoid runaway loops on bad data. */
export function tripDays(startDate: string, endDate: string, max = 366): string[] {
  const out: string[] = []
  for (let d = startDate; d <= endDate && out.length < max; d = addDays(d, 1)) out.push(d)
  return out
}

export function todayInZone(timeZone: string, now = new Date()): string {
  try {
    return formatInTimeZone(now, timeZone, 'yyyy-MM-dd')
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

export type TripPhase = 'upcoming' | 'ongoing' | 'past'

export function tripPhase(trip: { startDate: string; endDate: string; timeZone: string }, now = new Date()): TripPhase {
  const today = todayInZone(trip.timeZone, now)
  if (today < trip.startDate) return 'upcoming'
  if (today > trip.endDate) return 'past'
  return 'ongoing'
}

const WEEKDAY = new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' })
const SHORT = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const LONG = new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

export const formatWeekday = (date: string) => WEEKDAY.format(utcDate(date))
export const formatShortDate = (date: string) => SHORT.format(utcDate(date))
export const formatLongDate = (date: string) => LONG.format(utcDate(date))

export function formatDateRange(start: string, end: string): string {
  const year = (d: string) => d.slice(0, 4)
  const tail = year(start) === year(end) ? ` ${year(end)}` : ''
  if (start === end) return `${formatShortDate(start)} ${year(start)}`
  return `${formatShortDate(start)}${year(start) !== year(end) ? ` ${year(start)}` : ''} – ${formatShortDate(end)}${tail}`
}

/** "14:30" → "2:30 pm". Pure string formatting, no time zone involved. */
export function formatTime(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function allTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return ['UTC']
  }
}
