import { ChevronDown, Plus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useUser } from '@/features/auth/AuthProvider'
import { useMyTrips } from './tripApi'
import type { Trip } from '@/lib/firestore'

/** Trip name in the header doubles as a switcher between trips. */
export function TripSwitcher({ trip, section }: { trip: Trip; section: string }) {
  const user = useUser()
  const navigate = useNavigate()
  const { data: trips } = useMyTrips(user.uid)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-11 max-w-full items-center gap-1 rounded-full px-2 text-[1.0625rem] font-semibold outline-none hover:bg-foreground/5 focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span aria-hidden>{trip.coverEmoji}</span>
        <span className="truncate">{trip.name}</span>
        <ChevronDown className="size-4 shrink-0" aria-hidden />
        <span className="sr-only">Switch trip</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60dvh] w-64 overflow-y-auto">
        <DropdownMenuLabel>Your trips</DropdownMenuLabel>
        {trips.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => navigate(`/trips/${t.id}/${section}`)} aria-current={t.id === trip.id}>
            <span aria-hidden>{t.coverEmoji}</span>
            <span className="flex-1 truncate">{t.name}</span>
            {t.id === trip.id && <span className="text-xs font-semibold text-primary">Current</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/trips/new')}>
          <Plus /> New trip
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
