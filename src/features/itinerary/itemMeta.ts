import type { Item } from '@/lib/firestore'

/** One-line hint for a row in the day view: only what needs attention. */
export function rowHint(item: Item): { text: string; tone: 'warn' | 'danger' } | null {
  if (item.meta?.status === 'cancel') return { text: 'To cancel', tone: 'danger' }
  if (item.meta?.todo.length) return { text: 'Missing info', tone: 'warn' }
  return null
}
