import { forwardRef, type ReactNode } from 'react'
import { ExternalLink, MapPin } from 'lucide-react'
import type { Expense, Item } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/shared/money'
import { formatTime } from '@/shared/dates'
import { ITEM_TYPE_META, ItemTypeIcon } from './itemTypes'

export function timeLabel(item: Item): string {
  if (item.type === 'stay') return item.checkIn?.time ? `Check in ${formatTime(item.checkIn.time)}` : 'Check in'
  if (!item.startTime) return 'Anytime'
  return item.endTime ? `${formatTime(item.startTime)} – ${formatTime(item.endTime)}` : formatTime(item.startTime)
}

/** A plan in the timeline (content layer: solid card). */
export const ItemCard = forwardRef<HTMLDivElement, { item: Item; expense?: Expense; onOpen(): void; handle?: ReactNode; className?: string; style?: React.CSSProperties }>(
  function ItemCard({ item, expense, onOpen, handle, className, style }, ref) {
    const meta = ITEM_TYPE_META[item.type]
    return (
      <div ref={ref} style={style} className={cn('flex items-stretch gap-1 rounded-[1.25rem] bg-card ring-1 ring-border/70', className)}>
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 rounded-[1.25rem] p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <ItemTypeIcon type={item.type} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{item.title}</p>
            <p className="text-sm text-muted-foreground">
              <span className={cn('font-medium', meta.color)}>{meta.label}</span> · {timeLabel(item)}
            </p>
            {item.location && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{item.location.name}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {expense && <span className="text-sm font-semibold tabular-nums">{formatMoney(expense.amountMinor, expense.currency)}</span>}
            {item.bookingUrl && <ExternalLink className="size-4 text-muted-foreground" aria-label="Has booking link" />}
          </div>
        </button>
        {handle}
      </div>
    )
  },
)
