import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Floating primary action (functional layer). It is the view's one tinted,
 * prominent control, so it gets the accent fill. `withTabBar` lifts it above
 * the floating tab bar.
 */
export function Fab({
  label,
  onClick,
  icon = <Plus className="size-6" aria-hidden />,
  withTabBar = false,
  extended = false,
  className,
}: {
  label: string
  onClick(): void
  icon?: ReactNode
  withTabBar?: boolean
  extended?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'fixed right-4 z-40 inline-flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground outline-none transition-transform active:scale-95',
        'shadow-[inset_0_1px_0_oklch(1_0_0/0.25),0_10px_30px_oklch(0.3_0.08_186/0.35)] focus-visible:ring-[3px] focus-visible:ring-ring/50',
        extended ? 'px-5 text-[0.9375rem] font-semibold' : 'w-14',
        withTabBar ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom))]',
        'sm:right-[max(1rem,calc(50vw-32rem))]',
        className,
      )}
    >
      {icon}
      {extended && <span>{label}</span>}
    </button>
  )
}
