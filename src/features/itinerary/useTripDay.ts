import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { Trip } from '@/lib/firestore'
import { formatInTimeZone } from 'date-fns-tz'
import { todayInZone, tripDays } from '@/shared/dates'

/** "Today" in the trip's time zone, refreshed every minute and when the app comes back to the foreground. */
export function useTripToday(timeZone: string): string {
  const [today, setToday] = useState(() => todayInZone(timeZone))
  useEffect(() => {
    const tick = () => setToday(todayInZone(timeZone))
    const id = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [timeZone])
  return today
}

/**
 * The day the itinerary shows. With no explicit choice it follows today
 * during the trip (so it moves to the next day on its own), and Day 1
 * before or after the trip. Picking today again goes back to following it.
 */
export function useTripDay(trip: Trip) {
  const [params, setParams] = useSearchParams()
  const days = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate])
  const today = useTripToday(trip.timeZone)
  const autoDay = days.includes(today) ? today : days[0]!
  const chosen = params.get('day')
  const day = chosen && days.includes(chosen) ? chosen : autoDay
  const index = days.indexOf(day)

  const setDay = (d: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (d === autoDay) n.delete('day')
        else n.set('day', d)
        return n
      },
      { replace: true },
    )
  const step = (delta: number) => {
    const next = days[index + delta]
    if (next) setDay(next)
  }
  return { days, day, index, today, setDay, step }
}

/** The current local time ("HH:mm") in the trip's time zone, refreshed every 30 seconds and on returning to the app. */
export function useTripTime(timeZone: string): string {
  const read = () => {
    try {
      return formatInTimeZone(new Date(), timeZone, 'HH:mm')
    } catch {
      return new Date().toISOString().slice(11, 16)
    }
  }
  const [time, setTime] = useState(read)
  useEffect(() => {
    const tick = () => setTime(read())
    const id = setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZone])
  return time
}
