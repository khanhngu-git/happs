import { NavLink } from 'react-router'
import { CalendarDays, MapIcon, Users, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { to: 'itinerary', label: 'Itinerary', icon: CalendarDays },
  { to: 'expenses', label: 'Expenses', icon: Wallet },
  { to: 'map', label: 'Map', icon: MapIcon },
  { to: 'members', label: 'Members', icon: Users },
] as const

/**
 * Floating glass tab bar (functional layer). Monochrome items; only the
 * selected tab uses the accent, on a fill rather than nested glass.
 */
export function TabBar({ badges }: { badges?: Partial<Record<(typeof TABS)[number]['to'], number>> }) {
  return (
    <nav aria-label="Trip sections" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="glass mx-auto flex max-w-md rounded-full p-1.5">
        {TABS.map(({ to, label, icon: Icon }) => {
          const badge = badges?.[to] ?? 0
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[0.6875rem] font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  isActive ? 'bg-foreground/[0.08] text-primary' : 'text-foreground hover:bg-foreground/[0.04]',
                )
              }
            >
              <Icon className="size-[1.375rem]" aria-hidden />
              {label}
              {badge > 0 && (
                <span className="absolute top-1 left-[calc(50%+0.5rem)] min-w-4 rounded-full bg-destructive px-1 text-center text-[0.625rem] leading-4 font-bold text-white" aria-label={`${badge} need attention`}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
