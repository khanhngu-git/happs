import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

/**
 * App-style header row: no separate bar. Back button, an optional small
 * context title and icon actions sit in one row that scrolls with the
 * page, directly above the screen's large title (iOS large-title layout).
 */
export function PageHeader({
  title,
  backTo,
  backLabel,
  actions,
  className,
}: {
  title?: ReactNode
  backTo?: string
  backLabel?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('pt-safe', className)}>
      <div className="mx-auto flex h-12 max-w-2xl items-center gap-1 px-2">
        {backTo && (
          <Link
            to={backTo}
            className={cn('inline-flex h-11 shrink-0 items-center rounded-full text-[1.0625rem] text-primary active:opacity-60', title ? 'w-9 -mr-1' : 'min-w-11 pr-1')}
            aria-label={backLabel ? `Back to ${backLabel}` : 'Back'}
          >
            <ChevronLeft className="size-7" aria-hidden />
            {backLabel && !title && <span className="max-w-[9rem] truncate">{backLabel}</span>}
          </Link>
        )}
        <div className={cn('flex min-w-0 flex-1 items-center', !backTo && 'pl-2')}>{title}</div>
        {actions && <div className="flex shrink-0 items-center">{actions}</div>}
      </div>
    </header>
  )
}

/** Large left-aligned title with an optional subtitle. */
export function LargeTitle({ children, subtitle, className, action }: { children: ReactNode; subtitle?: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <div className={cn('flex items-center gap-2 px-4 pt-1 pb-3', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="large-title">{children}</h1>
        {subtitle && <p className="mt-0.5 text-[0.9375rem] text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
