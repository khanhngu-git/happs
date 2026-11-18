import { RouterProvider } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { APIProvider } from '@vis.gl/react-google-maps'
import { MAPS_API_KEY, hasMaps } from '@/lib/maps'
import { router } from './router'

export function App() {
  return (
    <AuthProvider>
      {hasMaps ? (
        <APIProvider apiKey={MAPS_API_KEY} libraries={['places', 'marker']}>
          <RouterProvider router={router} />
        </APIProvider>
      ) : (
        <RouterProvider router={router} />
      )}
      <Toaster />
    </AuthProvider>
  )
}
