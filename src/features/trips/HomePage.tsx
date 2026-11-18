import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { Luggage } from 'lucide-react'
import { PageHeader, LargeTitle } from '@/components/PageHeader'
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

  const grouped = useMemo(() => {
    const out: Record<TripPhase, Trip[]> = { ongoing: [], upcoming: [], past: [] }
    for (const t of trips) out[tripPhase(t)].push(t)
    out.past.reverse() // most recent past trip first
    return out
  }, [trips])

  return (
    <>
      <PageHeader
        actions={
          <>
            <BellButton />
            <Link to="/profile" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-foreground/6" aria-label="Profile and settings">
              <UserAvatar name={profile?.displayName ?? user.displayName} photoURL={profile?.photoURL ?? user.photoURL} className="size-8" />
            </Link>
          </>
        }
      />
      <main className="mx-auto max-w-2xl pb-28">
        <LargeTitle>Trips</LargeTitle>
        <div className="space-y-8 px-4 pt-2">
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
              description="Create a trip, invite your friends, and plan it together. Got an invite link? Just open it."
              action={<Button onClick={() => navigate('/trips/new')}>Plan a trip</Button>}
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
        </div>
      </main>
      {trips.length > 0 && <Fab label="New trip" extended onClick={() => navigate('/trips/new')} />}
    </>
  )
}
