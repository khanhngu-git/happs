import { useEffect, useState } from 'react'
import { Lock, RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { UserAvatar } from '@/components/UserAvatar'
import { useTrip } from '@/features/trips/TripContext'
import { cn } from '@/lib/utils'
import { COMMON_CURRENCIES, formatMoney } from '@/shared/money'
import { fetchFxRate } from '@/shared/fx'
import type { SplitMethod } from '@/shared/split'
import { remaining, validateDraft, type CostDraft } from './costDraft'
import { sharesLocked } from './expenseApi'

/**
 * Amount, currency (+ FX rate), who paid and how it is split. Controlled:
 * the parent owns the draft and validates it on submit.
 */
/** Whether money has already moved on this expense (amount, payer and split can't change then). */
// eslint-disable-next-line react-refresh/only-export-components
export function useCostLocked(tripId: string, expenseId: string | null | undefined): boolean {
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    if (!expenseId) return
    let live = true
    sharesLocked(tripId, expenseId).then((l) => live && setLocked(l), () => {})
    return () => {
      live = false
    }
  }, [tripId, expenseId])
  return locked
}

export function CostFields({
  draft,
  onChange,
  idPrefix,
  paidByLabel = 'Paid by',
  locked = false,
}: {
  draft: CostDraft
  onChange(d: CostDraft): void
  idPrefix: string
  paidByLabel?: string
  /** Someone has paid towards this cost: show it, but don't let it change. */
  locked?: boolean
}) {
  const { trip, members, nameOf } = useTrip()
  const set = (patch: Partial<CostDraft>) => onChange({ ...draft, ...patch })
  const foreign = draft.currency !== trip.baseCurrency
  const currencies = [...new Set([trip.baseCurrency, draft.currency, ...COMMON_CURRENCIES])]
  const result = validateDraft(draft, trip.baseCurrency)
  const left = remaining(draft)

  // Prefill the FX rate when switching to a foreign currency (user editable).
  useEffect(() => {
    if (!foreign) return
    const ctrl = new AbortController()
    fetchFxRate(draft.currency, trip.baseCurrency, ctrl.signal).then((rate) => {
      if (rate && !ctrl.signal.aborted) onChange({ ...draft, fxRate: String(Number(rate.toFixed(6))) })
    })
    return () => ctrl.abort()
    // Only when the currency changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.currency, trip.baseCurrency])

  function toggle(uid: string) {
    const ids = draft.participantIds.includes(uid) ? draft.participantIds.filter((u) => u !== uid) : [...draft.participantIds, uid]
    set({ participantIds: ids })
  }

  return (
    <fieldset disabled={locked} className="space-y-4 disabled:opacity-80">
      {locked && (
        <p className="flex gap-2 rounded-xl bg-foreground/[0.05] p-3 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Someone has already paid towards this, so the amount, payer and split are locked. You can still change the name, date and category.
        </p>
      )}
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-amount`}>Amount</Label>
          <Input id={`${idPrefix}-amount`} inputMode="decimal" placeholder="0.00" value={draft.amount} onChange={(e) => set({ amount: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-cur`}>Currency</Label>
          <NativeSelect id={`${idPrefix}-cur`} value={draft.currency} onChange={(e) => set({ currency: e.target.value, fxRate: e.target.value === trip.baseCurrency ? '1' : draft.fxRate })}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {foreign && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-fx`}>
            1 {draft.currency} = ? {trip.baseCurrency}
          </Label>
          <div className="flex gap-2">
            <Input id={`${idPrefix}-fx`} inputMode="decimal" value={draft.fxRate} onChange={(e) => set({ fxRate: e.target.value })} />
            <button
              type="button"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground/[0.07]"
              aria-label="Fetch today’s rate"
              onClick={() => fetchFxRate(draft.currency, trip.baseCurrency).then((r) => r && set({ fxRate: String(Number(r.toFixed(6))) }))}
            >
              <RefreshCw className="size-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">Captured now and kept with this cost, so later rate changes don’t move balances.</p>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-paidby`}>{paidByLabel}</Label>
        <NativeSelect id={`${idPrefix}-paidby`} value={draft.paidBy} onChange={(e) => set({ paidBy: e.target.value })}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {nameOf(m.id)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Split between</legend>
        <ToggleGroup type="single" value={draft.splitMethod} onValueChange={(v) => v && set({ splitMethod: v as SplitMethod })} className="w-full" aria-label="Split method">
          <ToggleGroupItem value="equal">Equally</ToggleGroupItem>
          <ToggleGroupItem value="exact">Amounts</ToggleGroupItem>
          <ToggleGroupItem value="percent">Percent</ToggleGroupItem>
        </ToggleGroup>
        <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl bg-card ring-1 ring-border/70">
          {members.map((m) => {
            const on = draft.participantIds.includes(m.id)
            const share = result.ok ? result.allocation[m.id] : undefined
            return (
              <li key={m.id} className="flex min-h-14 items-center gap-3 px-3">
                <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={on} onChange={() => toggle(m.id)} aria-label={`Include ${nameOf(m.id)}`} />
                  <UserAvatar name={m.displayName} photoURL={m.photoURL} className="size-8" />
                  <span className={cn('flex-1 truncate', !on && 'text-muted-foreground')}>{nameOf(m.id)}</span>
                </label>
                {on && draft.splitMethod !== 'equal' ? (
                  <div className="relative w-28">
                    <Input
                      aria-label={`${draft.splitMethod === 'percent' ? 'Percent' : 'Amount'} for ${nameOf(m.id)}`}
                      inputMode="decimal"
                      className="pr-7 text-right"
                      value={draft.values[m.id] ?? ''}
                      onChange={(e) => set({ values: { ...draft.values, [m.id]: e.target.value } })}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{draft.splitMethod === 'percent' ? '%' : ''}</span>
                  </div>
                ) : (
                  on && share !== undefined && <span className="text-sm font-medium tabular-nums">{formatMoney(share, draft.currency)}</span>
                )}
              </li>
            )
          })}
        </ul>
        {left && <p className={cn('text-sm', left.done ? 'text-success' : 'text-muted-foreground')}>{left.label}</p>}
      </fieldset>
    </fieldset>
  )
}
