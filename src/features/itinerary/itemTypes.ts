import { BedDouble, Bus, Camera, CarFront, Plane, Ship, Sparkles, TrainFront, Utensils, type LucideIcon } from 'lucide-react'
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


export type TransportMode = 'car' | 'flight' | 'train' | 'boat' | 'bus'

/**
 * How a transport plan travels, worked out from its title: taxis and
 * rideshares first (even "DiDi to the airport" is a car), then flights,
 * trains (incl. Maglev and G/D-numbered trains), boats; anything else is a bus.
 */
export function transportMode(title: string): TransportMode {
  if (/\b(taxi|didi|uber|car|cab|drive|rideshare)\b/i.test(title)) return 'car'
  if (/\b(flights?|fly|airlines?|airport|plane)\b|✈/i.test(title)) return 'flight'
  if (/\b(trains?|rail(way)?|metro|subway|maglev|bullet|tram|hsr)\b|\b[GDCZTK]\d{1,5}\b/i.test(title)) return 'train'
  if (/\b(ferry|boat|cruise|ship)\b/i.test(title)) return 'boat'
  return 'bus'
}

const MODE_ICON: Record<TransportMode, LucideIcon> = { car: CarFront, flight: Plane, train: TrainFront, boat: Ship, bus: Bus }

/** The icon for one plan: transport plans show how they travel. */
export function iconFor(item: { type: ItemType; title?: string }): LucideIcon {
  if (item.type !== 'transport' || !item.title) return ITEM_TYPE_META[item.type].icon
  return MODE_ICON[transportMode(item.title)]
}
