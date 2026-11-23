import { createElement } from 'react'
import type { ItemType } from '@/shared/itinerary'
import { ITEM_TYPE_META, iconFor } from './itemTypes'

/** A plan's icon in its type's colour. Pass the title so flights show a plane, trains a train. */
export function ItemTypeIcon({ type, title, className = 'size-10' }: { type: ItemType; title?: string; className?: string }) {
  const meta = ITEM_TYPE_META[type]
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${meta.chip} ${meta.color} ${className}`} aria-hidden>
      {createElement(iconFor({ type, title }), { className: 'size-[45%]' })}
    </span>
  )
}
