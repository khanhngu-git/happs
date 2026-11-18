import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { formatShortDate, utcDate } from '@/shared/dates'

const WEEKDAY = new Intl.DateTimeFormat('en-AU', { weekday: 'narrow', timeZone: 'UTC' })

/** iOS Calendar-style day strip: weekday initial above, date in a circle when selected. */
export function DayPicker({ days, selected, today, onSelect }: { days: string[]; selected: string; today: string; onSelect(d: string): void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [selected])
  return (
    <div ref={ref} className="flex snap-x gap-1 overflow-x-auto px-3 [scrollbar-width:none]" role="tablist" aria-label="Trip days">
      {days.map((d, i) => {
        const on = d === selected
        const isToday = d === today
        return (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`Day ${i + 1}, ${formatShortDate(d)}${isToday ? ', today' : ''}`}
            onClick={() => onSelect(d)}
            className="flex w-11 shrink-0 snap-center flex-col items-center gap-1 rounded-full pt-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className={cn('text-[0.6875rem] font-semibold', isToday ? 'text-primary' : 'text-muted-foreground')}>{WEEKDAY.format(utcDate(d))}</span>
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-full text-[1.0625rem] font-semibold tabular-nums transition-colors',
                on ? (isToday ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background') : isToday ? 'text-primary' : 'text-foreground',
              )}
            >
              {utcDate(d).getUTCDate()}
            </span>
            {/* The live day keeps a dot even when another day is selected. */}
            <span className={cn('size-1.5 rounded-full', isToday ? 'bg-primary' : 'bg-transparent')} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
