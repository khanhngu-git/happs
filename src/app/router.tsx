import { createBrowserRouter, Navigate } from 'react-router'
import { RootLayout } from './RootLayout'
import { AppLayout } from './AppLayout'
import { NotFound } from './NotFound'
import { RedirectIfSignedIn, RequireAuth } from '@/features/auth/RequireAuth'
import { LoginPage } from '@/features/auth/LoginPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { ResetPage } from '@/features/auth/ResetPage'
import { HomePage } from '@/features/trips/HomePage'
import { FullScreenLoader } from '@/components/FullScreenLoader'

/** Route-level code splitting: each screen loads on first visit. */
const lazy =
  <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] })

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    hydrateFallbackElement: <FullScreenLoader />,
    children: [
      {
        element: <RedirectIfSignedIn />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/signup', element: <SignupPage /> },
        ],
      },
      { path: '/reset', element: <ResetPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <HomePage /> },
              { path: 'trips/new', lazy: lazy(() => import('@/features/trips/NewTripPage'), 'NewTripPage') },
              { path: 'notifications', lazy: lazy(() => import('@/features/notifications/NotificationsPage'), 'NotificationsPage') },
              { path: 'profile', lazy: lazy(() => import('@/features/profile/ProfilePage'), 'ProfilePage') },
              {
                path: 'trips/:tripId',
                lazy: lazy(() => import('@/features/trips/TripLayout'), 'TripLayout'),
                children: [
                  { index: true, element: <Navigate to="itinerary" replace /> },
                  { path: 'itinerary', lazy: lazy(() => import('@/features/itinerary/ItineraryTab'), 'ItineraryTab') },
                  { path: 'itinerary/all', lazy: lazy(() => import('@/features/itinerary/AllActivitiesPage'), 'AllActivitiesPage') },
                  { path: 'expenses', lazy: lazy(() => import('@/features/expenses/ExpensesTab'), 'ExpensesTab') },
                  { path: 'map', lazy: lazy(() => import('@/features/map/MapTab'), 'MapTab') },
                  { path: 'members', lazy: lazy(() => import('@/features/trips/MembersTab'), 'MembersTab') },
                  { path: 'settings', lazy: lazy(() => import('@/features/trips/TripSettingsPage'), 'TripSettingsPage') },
                ],
              },
            ],
          },
          // Invite links: signed-out visitors log in first, then come back here.
          { path: 'join/:code', lazy: lazy(() => import('@/features/invites/JoinPage'), 'JoinPage') },
          // Unknown paths are guarded too, so deep links bounce through login.
          { path: '*', element: <NotFound /> },
        ],
      },
      { path: '/home', element: <Navigate to="/" replace /> },
    ],
  },
])
