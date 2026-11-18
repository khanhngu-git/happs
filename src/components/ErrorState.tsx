import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from './EmptyState'

export function ErrorState({ error, onRetry }: { error?: Error | null; onRetry?: () => void }) {
  const permission = error && 'code' in error && (error as { code?: string }).code === 'permission-denied'
  return (
    <EmptyState
      icon={<AlertTriangle />}
      title={permission ? 'You don’t have access to this' : 'Something went wrong'}
      description={permission ? 'Ask a member of this trip to send you an invite link.' : (error?.message ?? 'Please try again.')}
      action={onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    />
  )
}
