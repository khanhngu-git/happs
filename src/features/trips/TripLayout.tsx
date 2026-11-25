import { Outlet, useLocation, useParams, Link } from 'react-router'
import { Settings } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/ErrorState'
import { Skeleton } from '@/components/ui/skeleton'
import { useUser } from '@/features/auth/AuthProvider'
import { BellButton } from '@/features/notifications/BellButton'
import { NotFound } from '@/app/NotFound'
import { TripProvider } from './TripContext'
import { LiveLocationProvider } from '@/features/location/LiveLocationProvider'
import { TabBar } from './TabBar'
import { TripSwitcher } from './TripSwitcher'
import { useMembers, useTripDoc } from './tripApi'
import { usePendingConfirmations } from '@/features/expenses/usePendingConfirmations'

export function TripLayout() {
  const { tripId } = useParams()
  const user = useUser()
  const location = useLocation()
  const trip = useTripDoc(tripId)
  const members = useMembers(tripId)
  const canManage = !!trip.data && (trip.data.ownerId === user.uid || (trip.data.adminIds ?? []).includes(user.uid))
  const pending = usePendingConfirmations(tripId, user.uid)
  const section = location.pathname.split('/')[3] ?? 'itinerary'
  const onAll = location.pathname.endsWith('/itinerary/all')

  if (trip.loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4 pt-20" aria-busy>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    )
  }
  if (trip.error) return <div className="mx-auto max-w-md p-4 pt-20"><ErrorState error={trip.error} /></div>
  if (!trip.data) return <NotFound />

  return (
    <TripProvider trip={trip.data} members={members.data} me={user.uid}>
      <LiveLocationProvider>
      <PageHeader
        backTo={onAll ? `/trips/${trip.data.id}/itinerary` : '/'}
        backLabel={onAll ? 'Day view' : 'Trips'}
        title={<TripSwitcher trip={trip.data} section={section} />}
        actions={
          <>
            <BellButton />
            {canManage && (
              <Link to={`/trips/${trip.data.id}/settings`} className="inline-flex size-11 items-center justify-center rounded-full text-primary active:opacity-60" aria-label="Trip settings">
                <Settings className="size-[1.375rem]" aria-hidden />
              </Link>
            )}
          </>
        }
      />
      <div className="pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <TabBar badges={{ expenses: pending }} />
      </LiveLocationProvider>
    </TripProvider>
  )
}
