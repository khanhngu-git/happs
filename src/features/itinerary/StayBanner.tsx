import { BedDouble } from 'lucide-react'
import type { Item } from '@/lib/firestore'
import type { StayOnDay } from '@/shared/itinerary'
import { formatTime } from '@/shared/dates'

/** "Sleeping at: Hotel X" on every night a stay covers. */
export function StayBanner({ info, onOpen }: { info: StayOnDay<Item>; onOpen(): void }) {
  const { stay, sleeping, checkingIn, checkingOut } = info
  let label = 'Sleeping at'
  if (checkingOut && !sleeping) label = `Check out${stay.checkOut?.time ? ` by ${formatTime(stay.checkOut.time)}` : ''} from`
  else if (checkingIn) label = `Check in${stay.checkIn?.time ? ` from ${formatTime(stay.checkIn.time)}` : ''} · sleeping at`
  return (
    <button type="button" onClick={onOpen} className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-indigo-500/12 px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <BedDouble className="size-5 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[0.9375rem]">
        <span className="text-foreground/80">{label}: </span>
        <span className="font-semibold">{stay.title}</span>
      </span>
    </button>
  )
}
