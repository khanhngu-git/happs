import { Loader2 } from 'lucide-react'

export function FullScreenLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  )
}
