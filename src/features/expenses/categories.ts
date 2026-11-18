export const EXPENSE_CATEGORIES = [
  { value: 'food', label: 'Food & drink' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'transport', label: 'Transport' },
  { value: 'stay', label: 'Accommodation' },
  { value: 'activity', label: 'Activities' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'other', label: 'Other' },
] as const

export const categoryLabel = (v: string) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ?? 'Other'
