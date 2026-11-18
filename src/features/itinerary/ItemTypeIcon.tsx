import type { ItemType } from '@/shared/itinerary'
import { ITEM_TYPE_META } from './itemTypes'

export function ItemTypeIcon({ type, className = 'size-10' }: { type: ItemType; className?: string }) {
  const meta = ITEM_TYPE_META[type]
  const Icon = meta.icon
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${meta.chip} ${meta.color} ${className}`} aria-hidden>
      <Icon className="size-[45%]" />
    </span>
  )
}
