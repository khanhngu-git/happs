import { createBrowserRouter, Navigate } from 'react-router'
import { RootLayout } from './RootLayout'
import { AppLayout } from './AppLayout'
import { RedirectIfSignedIn, RequireAuth } from '@/features/auth/RequireAuth'
import { LoginPage } from '@/features/auth/LoginPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { ResetPage } from '@/features/auth/ResetPage'
import { NotFound } from './NotFound'
import { HomePage } from '@/features/trips/HomePage'

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
            children: [{ index: true, element: <HomePage /> }],
          },
          // Unknown paths are guarded too, so deep links bounce through login.
          { path: '*', element: <NotFound /> },
        ],
      },
      { path: '/home', element: <Navigate to="/" replace /> },
    ],
  },
])
