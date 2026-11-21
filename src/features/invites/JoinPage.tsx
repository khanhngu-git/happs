import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CalendarDays, MapPin, TicketX } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { getInvitePreview, InviteError, joinTrip } from './inviteApi'
import { cn } from '@/lib/utils'
import { formatDateRange } from '@/shared/dates'
import type { InvitePreview } from '@/shared/schemas'

/** /join/:code — guarded, so signed-out visitors go to login and bounce back here. */
export function JoinPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const user = useUser()
  const { profile } = useAuth()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    let cancelled = false
    getInvitePreview(code, user.uid)
      .then((p) => !cancelled && setPreview(p))
      .catch((err) => !cancelled && setError(err instanceof InviteError ? err.message : 'Couldn’t load this invite. Check your connection.'))
    return () => {
      cancelled = true
    }
  }, [code, user.uid])

  async function join() {
    setJoining(true)
    try {
      const { tripId } = await joinTrip(code, user, profile)
      toast.success(`You’re in! Welcome to ${preview?.tripName}`)
      navigate(`/trips/${tripId}/itinerary`, { replace: true })
    } catch (err) {
      toast.error(err instanceof InviteError ? err.message : 'Couldn’t join. Check your connection and try again.')
      setJoining(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 pt-safe pb-safe">
      {error ? (
        <EmptyState
          icon={<TicketX />}
          title="This invite can’t be used"
          description={error}
          action={
            <Button asChild variant="secondary">
              <Link to="/">Go to my trips</Link>
            </Button>
          }
        />
      ) : !preview ? (
        <div className="space-y-4" aria-busy>
          <Skeleton className="h-40 rounded-[1.75rem]" />
          <Skeleton className="h-12 rounded-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-center text-[1.0625rem]">
            <strong>{preview.invitedBy}</strong> invited you to
          </p>
          <div className={cn('relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-teal-500 to-cyan-700 p-6 text-white shadow-lg', preview.coverPhotoURL && 'pt-32')}>
            {preview.coverPhotoURL && (
              <>
                <img src={preview.coverPhotoURL} alt="" className="absolute inset-0 size-full object-cover" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" aria-hidden />
              </>
            )}
            <div className="relative">
            {!preview.coverPhotoURL && (
              <div className="text-5xl" aria-hidden>
                {preview.coverEmoji ?? '✈️'}
              </div>
            )}
            <h1 className="mt-4 text-3xl font-bold tracking-tight">{preview.tripName}</h1>
            <div className="mt-3 space-y-1 text-[0.9375rem] font-medium">
              {preview.destination && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="size-4" aria-hidden /> {preview.destination}
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden /> {formatDateRange(preview.startDate, preview.endDate)}
              </p>
            </div>
            </div>
          </div>
          {preview.alreadyMember ? (
            <Button size="lg" className="w-full" onClick={() => navigate(`/trips/${preview.tripId}/itinerary`, { replace: true })}>
              You’re already in. Open trip
            </Button>
          ) : (
            <Button size="lg" className="w-full" onClick={join} disabled={joining}>
              {joining ? 'Joining…' : 'Join trip'}
            </Button>
          )}
          <Button asChild variant="ghost" className="w-full">
            <Link to="/">Not now</Link>
          </Button>
        </div>
      )}
    </main>
  )
}
