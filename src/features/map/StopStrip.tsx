import { createElement } from 'react'
import { ITEM_TYPE_META, iconFor } from '@/features/itinerary/itemTypes'
import { timeLabel } from '@/features/itinerary/format'
import type { MapStop } from './mapData'
import type { ItemType } from '@/shared/itinerary'

function Icon({ type, title }: { type: ItemType; title: string }) {
  return createElement(iconFor({ type, title }), { className: 'size-4', 'aria-hidden': true })
}

/**
 * The day's stops as swipeable cards: the timed schedule in order (matching
 * the numbers on the map), then anytime plans. Tapping one selects it.
 */
export function StopStrip({ stops, onSelect }: { stops: MapStop[]; onSelect(id: string): void }) {
  const numbered = stops.filter((s) => s.item.type !== 'stay')
  return (
    <ol className="pointer-events-auto flex snap-x gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]" aria-label="Stops in order">
      {numbered.map((s) => (
        <li key={s.item.id} className="snap-start">
          <button
            type="button"
            onClick={() => onSelect(s.item.id)}
            className="glass-strong flex h-16 w-60 items-center gap-3 rounded-2xl px-3 text-left active:scale-[0.98]"
          >
            {s.item.photoURL ? (
              <span className="relative shrink-0" aria-hidden>
                <img src={s.item.photoURL} alt="" className="size-11 rounded-xl object-cover" />
                {s.number !== null && (
                  <span className="absolute -top-1 -left-1 flex size-5 items-center justify-center rounded-full border-2 border-white text-[0.6875rem] font-extrabold text-white" style={{ background: ITEM_TYPE_META[s.item.type].hex }}>
                    {s.number}
                  </span>
                )}
              </span>
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-[3px] border-white text-[0.9375rem] font-extrabold text-white shadow" style={{ background: ITEM_TYPE_META[s.item.type].hex }} aria-hidden>
                {s.number ?? <Icon type={s.item.type} title={s.item.title} />}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[0.9375rem] font-semibold">{s.item.title}</span>
              <span className="block truncate text-[0.8125rem]">{timeLabel(s.item)}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}
