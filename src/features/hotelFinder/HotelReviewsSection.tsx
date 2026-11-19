import { useEffect, useState } from 'react'
import { Loader2, MessageSquareQuote, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTrip } from '@/features/trips/TripContext'
import { api, callableMessage } from '@/lib/functions'
import { cn } from '@/lib/utils'
import { formatShortDate } from '@/shared/dates'
import type { HotelReview, HotelReviews } from '@/shared/hotelFinder'

function ReviewRow({ r }: { r: HotelReview }) {
  const [open, setOpen] = useState(false)
  const long = r.text.length > 220
  return (
    <li className="space-y-1 px-4 py-3">
      <p className="flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] text-muted-foreground">
        {r.rating !== null && (
          <span className="inline-flex items-center gap-0.5 font-semibold text-foreground">
            <Star className="size-3 fill-current text-warning" aria-hidden /> {r.rating}
          </span>
        )}
        {[r.author, r.travelType, r.date && formatShortDate(r.date)].filter(Boolean).join(' · ')}
      </p>
      <p className={cn('text-[0.9375rem] whitespace-pre-line', !open && long && 'line-clamp-4')}>{r.text}</p>
      <p className="flex gap-3 text-[0.8125rem]">
        {r.translated && <span className="text-muted-foreground">Translated</span>}
        {long && (
          <button type="button" className="font-medium text-primary" onClick={() => setOpen((v) => !v)}>
            {open ? 'Less' : 'More'}
          </button>
        )}
      </p>
    </li>
  )
}

/**
 * Trip.com guest reviews for a hotel, loaded only when asked (each load
 * runs a scraper on Apify; results are cached on the server for 6 hours).
 */
export function HotelReviewsSection({ hotelId }: { hotelId: string }) {
  const { trip } = useTrip()
  const [data, setData] = useState<HotelReviews | null>(null)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [busy])

  async function load() {
    setBusy(true)
    setElapsed(0)
    setError(null)
    try {
      setData(await api.hotelReviews({ tripId: trip.id, hotelId }))
    } catch (err) {
      setError(callableMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={`reviews-${hotelId}`} className="space-y-2">
      <h3 id={`reviews-${hotelId}`} className="px-1 text-[0.8125rem] font-medium text-muted-foreground uppercase">
        Guest reviews
      </h3>
      {!data && !busy && (
        <Button variant="secondary" className="w-full" onClick={load}>
          <MessageSquareQuote /> Show guest reviews
        </Button>
      )}
      {busy && (
        <p className="flex items-center justify-center gap-2 py-4 text-[0.9375rem] text-muted-foreground" role="status">
          <Loader2 className="size-5 animate-spin" aria-hidden /> Reading reviews… {elapsed}s
        </p>
      )}
      {error && (
        <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-[0.9375rem]" role="alert">
          {error}
        </p>
      )}
      {data && (
        <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/70">
          {(data.score !== null || data.subScores.length > 0) && (
            <div className="space-y-2 border-b border-border/70 px-4 py-3">
              {data.score !== null && (
                <p className="text-[1.0625rem]">
                  <span className="font-bold tabular-nums">{data.score}</span>
                  {data.scoreText && <span className="font-semibold"> {data.scoreText}</span>}
                  {data.count !== null && <span className="text-[0.875rem] text-muted-foreground"> · {data.count.toLocaleString()} reviews</span>}
                </p>
              )}
              {data.subScores.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.8125rem] text-muted-foreground">
                  {data.subScores.map((s) => (
                    <span key={s.name}>
                      {s.name} <span className="font-semibold text-foreground tabular-nums">{s.score}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {data.reviews.length === 0 ? (
            <p className="px-4 py-3 text-[0.9375rem] text-muted-foreground">No written reviews yet.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {data.reviews.map((r) => (
                <ReviewRow key={r.id} r={r} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
