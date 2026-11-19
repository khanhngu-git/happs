import { ArrowDown } from 'lucide-react'
import type { Location } from '@/shared/schemas'
import { RouteActions } from './RouteActions'

/** Between two plans: one tap to get from the first to the second. */
export function LegRow({ from, to, toTitle }: { from: Location; to: Location; toTitle: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-foreground/[0.03] py-2 pr-3 pl-4" aria-label={`Getting to ${toTitle}`}>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
        <ArrowDown className="size-4 shrink-0" aria-hidden />
        <span className="truncate">Getting there</span>
      </span>
      <RouteActions to={to} from={from} size="sm" />
    </li>
  )
}
