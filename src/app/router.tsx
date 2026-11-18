import { createBrowserRouter, Navigate } from 'react-router'
import { RootLayout } from './RootLayout'
import { AppLayout } from './AppLayout'
import { RedirectIfSignedIn, RequireAuth } from '@/features/auth/RequireAuth'
import { LoginPage } from '@/features/auth/LoginPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { ResetPage } from '@/features/auth/ResetPage'
import { NotFound } from './NotFound'
import { HomePage } from '@/features/trips/HomePage'
import { NewTripPage } from '@/features/trips/NewTripPage'
import { TripLayout } from '@/features/trips/TripLayout'
import { MembersTab } from '@/features/trips/MembersTab'
import { TripSettingsPage } from '@/features/trips/TripSettingsPage'
import { JoinPage } from '@/features/invites/JoinPage'
import { Placeholder } from './Placeholder'
import { ItineraryTab } from '@/features/itinerary/ItineraryTab'
import { ExpensesTab } from '@/features/expenses/ExpensesTab'

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
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
              { path: 'trips/new', element: <NewTripPage /> },
              {
                path: 'trips/:tripId',
                element: <TripLayout />,
                children: [
                  { index: true, element: <Navigate to="itinerary" replace /> },
                  { path: 'itinerary', element: <ItineraryTab /> },
                  { path: 'expenses', element: <ExpensesTab /> },
                  { path: 'map', element: <Placeholder name="Map" /> },
                  { path: 'members', element: <MembersTab /> },
                  { path: 'settings', element: <TripSettingsPage /> },
                ],
              },
            ],
          },
          // Invite links: signed-out visitors log in first, then come back here.
          { path: 'join/:code', element: <JoinPage /> },
          // Unknown paths are guarded too, so deep links bounce through login.
          { path: '*', element: <NotFound /> },
        ],
      },
      { path: '/home', element: <Navigate to="/" replace /> },
    ],
  },
])
