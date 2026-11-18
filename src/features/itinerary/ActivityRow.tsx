import { forwardRef, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Item } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { formatTime } from '@/shared/dates'
import { ItemTypeIcon } from './ItemTypeIcon'

function TimeCell({ item }: { item: Item }) {
  const t = item.type === 'stay' ? item.checkIn?.time : item.startTime
  if (!t) return <span className="text-[0.8125rem] text-muted-foreground">Anytime</span>
  const [time, suffix] = formatTime(t).split(' ')
  return (
    <span className="leading-tight tabular-nums">
      <span className="block text-[0.9375rem] font-semibold">{time}</span>
      <span className="block text-[0.75rem] text-muted-foreground">{suffix}</span>
    </span>
  )
}

/** One row in an inset grouped list: time · icon · title / place. */
export const ActivityRow = forwardRef<HTMLLIElement, { item: Item; onOpen(): void; trailing?: ReactNode; showTime?: boolean; style?: React.CSSProperties; className?: string }>(
  function ActivityRow({ item, onOpen, trailing, showTime = true, style, className }, ref) {
    return (
      <li ref={ref} style={style} className={cn('flex items-center bg-card', className)}>
        <button type="button" onClick={onOpen} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left outline-none active:bg-foreground/[0.06] focus-visible:bg-foreground/5">
          {showTime && (
            <span className="w-12 shrink-0">
              <TimeCell item={item} />
            </span>
          )}
          {item.photoURL ? (
            <img src={item.photoURL} alt="" loading="lazy" className="size-10 shrink-0 rounded-xl object-cover" />
          ) : (
            <ItemTypeIcon type={item.type} className="size-8" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[1.0625rem]">{item.title}</span>
            {item.location?.name && item.location.name !== item.title && <span className="block truncate text-[0.875rem] text-muted-foreground">{item.location.name}</span>}
          </span>
          {!trailing && <ChevronRight className="mr-3 size-4 shrink-0 text-muted-foreground/70" aria-hidden />}
        </button>
        {trailing}
      </li>
    )
  },
)
