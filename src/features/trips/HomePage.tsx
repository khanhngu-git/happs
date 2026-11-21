import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight, FileUp, Luggage, Ticket } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Fab } from '@/components/Fab'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/UserAvatar'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { BellButton } from '@/features/notifications/BellButton'
import { InstallPrompt } from '@/app/InstallPrompt'
import { VerifyEmailBanner } from '@/features/auth/VerifyEmailBanner'
import { tripPhase, type TripPhase } from '@/shared/dates'
import type { Trip } from '@/lib/firestore'
import { TripCard } from './TripCard'
import { JoinTripDialog } from '@/features/invites/JoinTripDialog'
import { useMyTrips } from './tripApi'

const SECTIONS: { phase: TripPhase; title: string }[] = [
  { phase: 'ongoing', title: 'Happening now' },
  { phase: 'upcoming', title: 'Upcoming' },
  { phase: 'past', title: 'Past trips' },
]

export function HomePage() {
  const user = useUser()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { data: trips, loading, error } = useMyTrips(user.uid)
  const [joining, setJoining] = useState(false)

  const grouped = useMemo(() => {
    const out: Record<TripPhase, Trip[]> = { ongoing: [], upcoming: [], past: [] }
    for (const t of trips) out[tripPhase(t)].push(t)
    out.past.reverse() // most recent past trip first
    return out
  }, [trips])

  return (
    <>
      {/* Same header row as every other screen, so the icons never move between pages. */}
      <PageHeader
        title={<h1 className="large-title">Trips</h1>}
        actions={
          <>
            <BellButton />
            <Link to="/profile" className="inline-flex size-11 items-center justify-center rounded-full active:opacity-60" aria-label="Profile and settings">
              <UserAvatar name={profile?.displayName ?? user.displayName} photoURL={profile?.photoURL ?? user.photoURL} className="size-8" />
            </Link>
          </>
        }
      />
      <main className="mx-auto max-w-2xl pb-28">
        <div className="space-y-8 px-4 pt-3">
          <VerifyEmailBanner />
          <InstallPrompt />
          {loading ? (
            <div className="space-y-4" aria-busy>
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-44 rounded-[1.25rem]" />
              ))}
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={() => location.reload()} />
          ) : trips.length === 0 ? (
            <EmptyState
              icon={<Luggage />}
              title="No trips yet"
              description="Create a trip and invite your friends, or join one a friend has already started."
              action={
                <div className="flex w-full max-w-xs flex-col gap-2">
                  <Button onClick={() => navigate('/trips/new')}>Plan a trip</Button>
                  <Button variant="secondary" onClick={() => setJoining(true)}>
                    Join a trip
                  </Button>
                  <Button variant="ghost" onClick={() => navigate('/import')}>
                    Import an itinerary
                  </Button>
                </div>
              }
            />
          ) : (
            SECTIONS.filter((s) => grouped[s.phase].length > 0).map((s) => (
              <section key={s.phase} aria-labelledby={`sec-${s.phase}`} className="space-y-3">
                <h2 id={`sec-${s.phase}`} className="text-xl font-bold tracking-tight">
                  {s.title}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {grouped[s.phase].map((t) => (
                    <TripCard key={t.id} trip={t} phase={s.phase} />
                  ))}
                </div>
              </section>
            ))
          )}
          {trips.length > 0 && (
            <button
              type="button"
              onClick={() => setJoining(true)}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-card px-4 text-left ring-1 ring-border/70 active:bg-foreground/[0.06]"
            >
              <Ticket className="size-5 text-primary" aria-hidden />
              <span className="flex-1 text-[1.0625rem]">Join a trip with an invite</span>
              <ChevronRight className="size-4 text-muted-foreground/70" aria-hidden />
            </button>
          )}
          {trips.length > 0 && (
            <button
              type="button"
              onClick={() => navigate('/import')}
              className="-mt-4 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-card px-4 text-left ring-1 ring-border/70 active:bg-foreground/[0.06]"
            >
              <FileUp className="size-5 text-primary" aria-hidden />
              <span className="flex-1 text-[1.0625rem]">Import an itinerary</span>
              <ChevronRight className="size-4 text-muted-foreground/70" aria-hidden />
            </button>
          )}
        </div>
      </main>
      {trips.length > 0 && <Fab label="New trip" extended onClick={() => navigate('/trips/new')} />}
      <JoinTripDialog open={joining} onOpenChange={setJoining} />
    </>
  )
}
