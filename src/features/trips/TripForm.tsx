import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { FieldError } from '@/features/auth/AuthLayout'
import { allTimeZones, deviceTimeZone, isDateString } from '@/shared/dates'
import { COMMON_CURRENCIES } from '@/shared/money'
import { cn } from '@/lib/utils'
import { COVER_COLORS, type TripInput } from './tripApi'

const schema = z
  .object({
    name: z.string().trim().min(1, 'Give your trip a name').max(100),
    destination: z.string().trim().max(200),
    startDate: z.string().refine(isDateString, 'Pick a start date'),
    endDate: z.string().refine(isDateString, 'Pick an end date'),
    timeZone: z.string().min(1),
    baseCurrency: z.string().regex(/^[A-Z]{3}$/),
    coverEmoji: z.string().max(8),
    coverColor: z.string(),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'], message: 'The trip ends before it starts' })
type Values = z.infer<typeof schema>

const EMOJI = ['✈️', '🏝️', '🏔️', '🏙️', '🍜', '🎿', '🚗', '⛺️', '🏯', '🎉']
const TIME_ZONES = allTimeZones()

export function TripForm({
  initial,
  defaultCurrency,
  submitLabel,
  currencyLocked,
  onSubmit,
}: {
  initial?: Partial<TripInput>
  defaultCurrency: string
  submitLabel: string
  /** Changing base currency after expenses exist would invalidate base amounts. */
  currencyLocked?: boolean
  onSubmit(values: TripInput): Promise<void>
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      destination: initial?.destination ?? '',
      startDate: initial?.startDate ?? '',
      endDate: initial?.endDate ?? '',
      timeZone: initial?.timeZone ?? deviceTimeZone(),
      baseCurrency: initial?.baseCurrency ?? defaultCurrency,
      coverEmoji: initial?.coverEmoji ?? '✈️',
      coverColor: initial?.coverColor ?? 'teal',
    },
  })
  const { errors, isSubmitting } = form.formState
  const color = form.watch('coverColor')
  const emoji = form.watch('coverEmoji')
  const currencies = [...new Set([form.getValues('baseCurrency'), defaultCurrency, ...COMMON_CURRENCIES])]

  const submit = form.handleSubmit(async (v) => {
    await onSubmit({ ...v, coverEmoji: v.coverEmoji || null, coverColor: v.coverColor || null })
  })

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="trip-name">Trip name</Label>
        <Input id="trip-name" placeholder="Shanghai with the crew" aria-invalid={!!errors.name} aria-describedby="trip-name-error" {...form.register('name')} />
        <FieldError id="trip-name-error" message={errors.name?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="trip-dest">Destination</Label>
        <Input id="trip-dest" placeholder="Shanghai, China" {...form.register('destination')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="trip-start">Starts</Label>
          <Input id="trip-start" type="date" aria-invalid={!!errors.startDate} aria-describedby="trip-start-error" {...form.register('startDate')} />
          <FieldError id="trip-start-error" message={errors.startDate?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="trip-end">Ends</Label>
          <Input id="trip-end" type="date" aria-invalid={!!errors.endDate} aria-describedby="trip-end-error" {...form.register('endDate')} />
          <FieldError id="trip-end-error" message={errors.endDate?.message} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="trip-tz">Time zone</Label>
        <NativeSelect id="trip-tz" {...form.register('timeZone')}>
          {TIME_ZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replaceAll('_', ' ')}
            </option>
          ))}
        </NativeSelect>
        <p className="text-sm text-muted-foreground">Times in the itinerary are shown in the destination’s local time.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="trip-currency">Base currency</Label>
        <NativeSelect id="trip-currency" disabled={currencyLocked} {...form.register('baseCurrency')}>
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
        <p className="text-sm text-muted-foreground">
          {currencyLocked ? 'Locked because this trip already has expenses.' : 'Balances are totalled in this currency.'}
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Cover</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Emoji">
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={emoji === e}
              aria-label={`Emoji ${e}`}
              onClick={() => form.setValue('coverEmoji', e)}
              className={cn('flex size-11 items-center justify-center rounded-full text-xl transition-colors', emoji === e ? 'bg-primary/15 ring-2 ring-primary' : 'bg-foreground/5')}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-1" role="radiogroup" aria-label="Colour">
          {COVER_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={color === c.value}
              aria-label={`${c.value} cover`}
              onClick={() => form.setValue('coverColor', c.value)}
              className={cn('size-11 rounded-full bg-gradient-to-br ring-offset-2 ring-offset-background', c.className, color === c.value && 'ring-2 ring-foreground')}
            />
          ))}
        </div>
      </fieldset>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}
