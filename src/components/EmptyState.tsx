import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Friendly empty state with a call to action. Content layer: no glass. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-[1.25rem] bg-card px-6 py-10 text-center ring-1 ring-border/70', className)}>
      {icon && <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-7">{icon}</div>}
      <div className="space-y-1">
        <h3 className="text-[1.0625rem] font-semibold">{title}</h3>
        {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
