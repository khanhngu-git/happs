import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

/**
 * Sticky glass navigation bar (functional layer). Text is full-strength
 * foreground; actions are icon buttons without their own glass (no glass on glass).
 */
export function PageHeader({
  title,
  backTo,
  backLabel = 'Back',
  actions,
  children,
  className,
}: {
  title?: ReactNode
  backTo?: string
  backLabel?: string
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('glass sticky top-0 z-30 pt-safe', className)}>
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-2">
        {backTo ? (
          <Link
            to={backTo}
            className="inline-flex h-11 min-w-11 items-center gap-0.5 rounded-full pr-2 text-[1.0625rem] font-medium text-primary hover:bg-foreground/5"
          >
            <ChevronLeft className="size-6" aria-hidden />
            <span className="max-w-[8rem] truncate">{backLabel}</span>
          </Link>
        ) : (
          <div className="w-2" />
        )}
        <div className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold">{title}</div>
        {actions && <div className="flex items-center gap-0.5">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

/** Large left-aligned title used at the top of top-level screens (content layer). */
export function LargeTitle({ children, subtitle, className }: { children: ReactNode; subtitle?: ReactNode; className?: string }) {
  return (
    <div className={cn('px-4 pt-3 pb-2', className)}>
      <h1 className="large-title">{children}</h1>
      {subtitle && <p className="mt-1 text-[0.9375rem] text-muted-foreground">{subtitle}</p>}
    </div>
  )
}
