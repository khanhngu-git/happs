import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { formatShortDate, formatWeekday } from '@/shared/dates'

/** Horizontal day strip (content layer). The selected day uses the accent as a status fill. */
export function DayPicker({ days, selected, today, onSelect }: { days: string[]; selected: string; today: string; onSelect(d: string): void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-current="date"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [selected])
  return (
    <div ref={ref} className="flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Days">
      {days.map((d, i) => {
        const on = d === selected
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={on}
            aria-current={on ? 'date' : undefined}
            aria-label={`Day ${i + 1}, ${formatWeekday(d)} ${formatShortDate(d)}${d === today ? ', today' : ''}`}
            onClick={() => onSelect(d)}
            className={cn(
              'flex min-h-16 min-w-[4.25rem] shrink-0 snap-center flex-col items-center justify-center rounded-2xl px-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              on ? 'bg-primary text-primary-foreground' : 'bg-card ring-1 ring-border/70',
            )}
          >
            <span className="text-[0.6875rem] font-semibold uppercase">Day {i + 1}</span>
            <span className="text-[0.9375rem] font-bold">{formatWeekday(d)}</span>
            <span className="text-[0.6875rem]">
              {formatShortDate(d)}
              {d === today && ' · today'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
