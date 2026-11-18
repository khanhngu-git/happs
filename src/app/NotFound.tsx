import { Link } from 'react-router'
import { MapPinOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center p-4">
      <EmptyState
        className="w-full"
        icon={<MapPinOff />}
        title="We couldn’t find that page"
        description="The link may be old, or the trip may have been deleted."
        action={
          <Button asChild>
            <Link to="/">Go to my trips</Link>
          </Button>
        }
      />
    </div>
  )
}
