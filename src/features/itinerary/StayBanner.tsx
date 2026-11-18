import { BedDouble, ChevronRight } from 'lucide-react'
import type { Item } from '@/lib/firestore'
import type { StayOnDay } from '@/shared/itinerary'
import { formatTime } from '@/shared/dates'

/** Where you're sleeping tonight (or checking out from), as one quiet line. */
export function StayBanner({ info, onOpen }: { info: StayOnDay<Item>; onOpen(): void }) {
  const { stay, sleeping, checkingIn, checkingOut } = info
  let detail = 'Tonight'
  if (checkingIn) detail = stay.checkIn?.time ? `Check in ${formatTime(stay.checkIn.time)}` : 'Check in today'
  if (checkingOut && !sleeping) detail = stay.checkOut?.time ? `Check out ${formatTime(stay.checkOut.time)}` : 'Check out today'
  return (
    <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-card px-4 text-left ring-1 ring-border/70 outline-none active:bg-foreground/[0.06] focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <BedDouble className="size-5 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1.0625rem]">{stay.title}</span>
        <span className="block text-[0.875rem] text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />
    </button>
  )
}
