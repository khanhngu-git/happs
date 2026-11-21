import type { ItemCost } from '@/features/expenses/expenseApi'
import type { ItemType } from '@/shared/itinerary'
import type { Location } from '@/shared/schemas'

/** Starting values for a new itinerary item, e.g. from an idea. */
export interface ItemPrefill {
  type: ItemType
  title: string
  date: string
  startTime: string | null
  /** Stays only: the check-out date (check-in is `date`). */
  checkOutDate?: string | null
  location: Location | null
  photoURL: string | null
  notes: string
  cost: ItemCost | null
}
