import type { ItemCost } from '@/features/expenses/expenseApi'
import type { ItemType } from '@/shared/itinerary'
import type { Location } from '@/shared/schemas'

/** Starting values for a new itinerary item, e.g. from the activity finder. */
export interface ItemPrefill {
  type: ItemType
  title: string
  date: string
  startTime: string | null
  location: Location | null
  photoURL: string | null
  notes: string
  cost: ItemCost | null
}
