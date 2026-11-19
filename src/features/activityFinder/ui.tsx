import type { ReactNode } from 'react'
import { Loader2, Minus, Plus } from 'lucide-react'
import { Label } from '@/components/ui/label'
import type { DisplayPrice } from '@/shared/activityFinder'
import { formatMoney } from '@/shared/money'
import { cn } from '@/lib/utils'

/** iOS-style − n + stepper. */
export function Stepper({ id, label, value, min = 1, max = 9, onChange }: { id: string; label: string; value: number; min?: number; max?: number; onChange(n: number): void }) {
  return (
    <div className="space-y-2">
      <Label id={id}>{label}</Label>
      <div className="flex h-11 items-center justify-between rounded-xl bg-card px-1 ring-1 ring-input" role="group" aria-labelledby={id}>
        <button type="button" className="inline-flex size-10 items-center justify-center rounded-full disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label.toLowerCase()}`}>
          <Minus className="size-4" />
        </button>
        <span className="text-[1.0625rem] font-semibold tabular-nums" aria-live="polite">
          {value}
        </span>
        <button type="button" className="inline-flex size-10 items-center justify-center rounded-full disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label.toLowerCase()}`}>
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}

export function ResultsState({ busy, error, empty, children }: { busy: boolean; error: string | null; empty: boolean; children: ReactNode }) {
  if (busy)
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-[0.9375rem] text-muted-foreground" role="status">
        <Loader2 className="size-5 animate-spin" aria-hidden /> Searching…
      </p>
    )
  if (error) return <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-[0.9375rem]" role="alert">{error}</p>
  if (empty) return <p className="py-8 text-center text-[0.9375rem] text-muted-foreground">Nothing found. Try other dates or a nearby place.</p>
  return <>{children}</>
}

/**
 * A price in the trip's base currency. When it was converted (the provider
 * only quotes another currency), it reads "≈ A$…" and the amount checkout
 * will actually charge is shown underneath.
 */
export function Price({ item, className, suffix }: { item: { priceMinor: number; currency: string; display?: DisplayPrice }; className?: string; suffix?: string }) {
  const d = item.display ?? { priceMinor: item.priceMinor, currency: item.currency, approximate: false }
  return (
    <span className={cn('inline-flex flex-col items-end text-right', className)}>
      <span className="font-semibold whitespace-nowrap tabular-nums">
        {d.approximate && '≈ '}
        {formatMoney(d.priceMinor, d.currency)}
        {suffix && <span className="text-[0.8125rem] font-normal text-muted-foreground"> {suffix}</span>}
      </span>
      {d.approximate && <span className="text-[0.75rem] whitespace-nowrap text-muted-foreground tabular-nums">{formatMoney(item.priceMinor, item.currency)} at checkout</span>}
    </span>
  )
}
