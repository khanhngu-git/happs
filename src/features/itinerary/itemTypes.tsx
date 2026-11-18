import { BedDouble, Bus, Camera, Sparkles, Utensils, type LucideIcon } from 'lucide-react'
import type { ItemType } from '@/shared/itinerary'

/**
 * One colour + icon per item type, used in the timeline, forms and map.
 * Colour is never the only signal: the icon and the label go with it.
 */
export const ITEM_TYPE_META: Record<ItemType, { label: string; icon: LucideIcon; color: string; chip: string; hex: string }> = {
  activity: { label: 'Activity', icon: Camera, color: 'text-orange-600 dark:text-orange-400', chip: 'bg-orange-500/14', hex: '#ea580c' },
  food: { label: 'Food', icon: Utensils, color: 'text-rose-600 dark:text-rose-400', chip: 'bg-rose-500/14', hex: '#e11d48' },
  transport: { label: 'Transport', icon: Bus, color: 'text-sky-600 dark:text-sky-400', chip: 'bg-sky-500/14', hex: '#0284c7' },
  stay: { label: 'Stay', icon: BedDouble, color: 'text-indigo-600 dark:text-indigo-400', chip: 'bg-indigo-500/14', hex: '#4f46e5' },
  other: { label: 'Other', icon: Sparkles, color: 'text-slate-600 dark:text-slate-300', chip: 'bg-slate-500/14', hex: '#475569' },
}

export function ItemTypeIcon({ type, className = 'size-10' }: { type: ItemType; className?: string }) {
  const meta = ITEM_TYPE_META[type]
  const Icon = meta.icon
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${meta.chip} ${meta.color} ${className}`} aria-hidden>
      <Icon className="size-[45%]" />
    </span>
  )
}
