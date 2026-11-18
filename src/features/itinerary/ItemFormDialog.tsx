import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { FieldError } from '@/features/auth/AuthLayout'
import { useTrip } from '@/features/trips/TripContext'
import { CostFields } from '@/features/expenses/CostFields'
import { draftFromCost, emptyDraft, validateDraft, type CostDraft } from '@/features/expenses/costDraft'
import { SharesLockedError } from '@/features/expenses/expenseApi'
import type { Expense, Item } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { ITEM_TYPES, type ItemType } from '@/shared/itinerary'
import { isDateString, isTimeString } from '@/shared/dates'
import type { Location } from '@/shared/schemas'
import { ITEM_TYPE_META } from './itemTypes'
import { PlacePicker } from './PlacePicker'
import { newItemId, saveItem } from './itineraryApi'
import { removeByUrl, uploadItemPhoto } from '@/lib/uploads'
import { ImageError } from '@/lib/images'
import { ImagePlus, X } from 'lucide-react'

const optTime = z.string().refine((v) => v === '' || isTimeString(v), 'Use a time like 09:30')
const schema = z
  .object({
    type: z.enum(['activity', 'food', 'transport', 'stay', 'other']),
    title: z.string().trim().min(1, 'Give it a name').max(200),
    date: z.string().refine(isDateString, 'Pick a date'),
    startTime: optTime,
    endTime: optTime,
    checkOutDate: z.string(),
    checkOutTime: optTime,
    notes: z.string().max(5000),
    bookingUrl: z.union([z.literal(''), z.url('Enter a full link starting with https://')]),
    bookingRef: z.string().max(200),
  })
  .refine((v) => v.type !== 'stay' || (isDateString(v.checkOutDate) && v.checkOutDate >= v.date), { path: ['checkOutDate'], message: 'Check-out must be on or after check-in' })
  .refine((v) => v.type === 'stay' || !v.startTime || !v.endTime || v.endTime >= v.startTime, { path: ['endTime'], message: 'Ends before it starts' })
type Values = z.infer<typeof schema>

export function ItemFormDialog({
  open,
  onOpenChange,
  item,
  linkedExpense,
  defaultDate,
  nextOrder,
}: {
  open: boolean
  onOpenChange(o: boolean): void
  item: Item | null
  linkedExpense: Expense | null
  defaultDate: string
  nextOrder: number
}) {
  const { trip, me, members } = useTrip()
  const [location, setLocation] = useState<Location | null>(item?.location ?? null)
  const [hasCost, setHasCost] = useState(!!linkedExpense)
  const [draft, setDraft] = useState<CostDraft>(() =>
    linkedExpense ? draftFromCost(linkedExpense) : emptyDraft({ currency: trip.baseCurrency, paidBy: me, memberIds: members.map((m) => m.id) }),
  )
  const [costError, setCostError] = useState<string | null>(null)
  // Photo: a new File to upload, null to remove, undefined to keep what's there.
  const [photo, setPhoto] = useState<File | null | undefined>(undefined)
  const [preview, setPreview] = useState<string | null>(item?.photoURL ?? null)
  useEffect(() => {
    if (!photo) return
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])
  const [more, setMore] = useState(!!(item?.notes || item?.bookingUrl || item?.bookingRef || linkedExpense))

  const form = useForm<Values>({ resolver: zodResolver(schema) })
  const { errors, isSubmitting } = form.formState
  const type = form.watch('type')

  // Reset whenever the dialog opens for a different item.
  useEffect(() => {
    if (!open) return
    form.reset({
      type: item?.type ?? 'activity',
      title: item?.title ?? '',
      date: item?.checkIn?.date ?? item?.date ?? defaultDate,
      startTime: (item?.type === 'stay' ? item.checkIn?.time : item?.startTime) ?? '',
      endTime: item?.endTime ?? '',
      checkOutDate: item?.checkOut?.date ?? '',
      checkOutTime: item?.checkOut?.time ?? '',
      notes: item?.notes ?? '',
      bookingUrl: item?.bookingUrl ?? '',
      bookingRef: item?.bookingRef ?? '',
    })
    setLocation(item?.location ?? null)
    setHasCost(!!linkedExpense)
    setDraft(linkedExpense ? draftFromCost(linkedExpense) : emptyDraft({ currency: trip.baseCurrency, paidBy: me, memberIds: members.map((m) => m.id) }))
    setCostError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id, linkedExpense?.id])

  const submit = form.handleSubmit(async (v) => {
    let cost = null
    if (hasCost) {
      const r = validateDraft(draft, trip.baseCurrency)
      if (!r.ok) {
        setCostError(r.error)
        return
      }
      cost = r.cost
    }
    const stay = v.type === 'stay'
    try {
      const id = item?.id ?? newItemId(trip.id)
      let photoURL = item?.photoURL ?? null
      if (photo) photoURL = await uploadItemPhoto(trip.id, id, photo, item?.photoURL)
      else if (photo === null && item?.photoURL) {
        await removeByUrl(item.photoURL)
        photoURL = null
      }
      await saveItem({
        trip,
        uid: me,
        existing: item,
        id,
        nextOrder,
        cost,
        values: {
          type: v.type,
          title: v.title,
          date: v.date,
          startTime: v.startTime || null,
          endTime: stay ? null : v.endTime || null,
          checkIn: stay ? { date: v.date, time: v.startTime || null } : null,
          checkOut: stay ? { date: v.checkOutDate, time: v.checkOutTime || null } : null,
          location,
          notes: v.notes,
          bookingUrl: v.bookingUrl,
          bookingRef: v.bookingRef,
          photoURL,
        },
      })
      toast.success(item ? 'Saved' : 'Added')
      onOpenChange(false)
    } catch (err) {
      if (err instanceof SharesLockedError) toast.warning(err.message, { duration: 8000 })
      else if (err instanceof ImageError) toast.error(err.message)
      else {
        console.error(err)
        toast.error('Couldn’t save. Check your connection and try again.')
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? 'Edit activity' : 'New activity'}</DialogTitle>
          <DialogDescription className="sr-only">Details, time, place and cost</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <fieldset>
            <legend className="sr-only">Type</legend>
            <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Type">
              {ITEM_TYPES.map((t: ItemType) => {
                const meta = ITEM_TYPE_META[t]
                const Icon = meta.icon
                const on = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={meta.label}
                    onClick={() => form.setValue('type', t)}
                    className={cn('flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold transition-colors', on ? `${meta.chip} ring-2 ring-current ${meta.color}` : 'bg-foreground/[0.05]')}
                  >
                    <Icon className="size-5" aria-hidden />
                    <span className={on ? '' : 'text-foreground'}>{meta.label}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="item-title">{type === 'stay' ? 'Where are you staying?' : 'What’s the plan?'}</Label>
            <Input id="item-title" placeholder={type === 'stay' ? 'Hotel, Airbnb…' : 'The Bund at night'} aria-invalid={!!errors.title} aria-describedby="item-title-error" {...form.register('title')} />
            <FieldError id="item-title-error" message={errors.title?.message} />
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-foreground/[0.05]">
            {preview ? (
              <>
                <img src={preview} alt="Activity photo" className="aspect-[16/9] w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setPhoto(null)
                    setPreview(null)
                  }}
                  className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-full bg-black/50 text-white"
                  aria-label="Remove photo"
                >
                  <X className="size-5" />
                </button>
              </>
            ) : (
              <label className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 text-[0.9375rem] font-medium text-primary">
                <ImagePlus className="size-5" aria-hidden />
                Add a photo
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Add a photo"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) setPhoto(f)
                    e.target.value = ''
                  }}
                />
              </label>
            )}
          </div>

          {type === 'stay' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="item-date">Check in</Label>
                <Input id="item-date" type="date" {...form.register('date')} />
                <Input aria-label="Check-in time" type="time" {...form.register('startTime')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-out">Check out</Label>
                <Input id="item-out" type="date" aria-invalid={!!errors.checkOutDate} aria-describedby="item-out-error" {...form.register('checkOutDate')} />
                <Input aria-label="Check-out time" type="time" {...form.register('checkOutTime')} />
              </div>
              <div className="col-span-2">
                <FieldError id="item-out-error" message={errors.checkOutDate?.message} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="item-date">Date</Label>
                <Input id="item-date" type="date" min={trip.startDate} max={trip.endDate} {...form.register('date')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-start">Starts</Label>
                <Input id="item-start" type="time" {...form.register('startTime')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-end">Ends</Label>
                <Input id="item-end" type="time" aria-invalid={!!errors.endTime} {...form.register('endTime')} />
              </div>
              <p className="col-span-3 text-sm text-muted-foreground">
                Times are in {trip.timeZone.replaceAll('_', ' ')}. Leave blank for “Anytime”.
              </p>
              <div className="col-span-3">
                <FieldError id="item-end-error" message={errors.endTime?.message} />
              </div>
            </div>
          )}

          <PlacePicker id="item-place" value={location} onChange={setLocation} />

          {more ? (
            <>
          <div className="space-y-2">
            <Label htmlFor="item-notes">Notes</Label>
            <Textarea id="item-notes" rows={3} {...form.register('notes')} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="item-url">Booking link</Label>
              <Input id="item-url" type="url" inputMode="url" placeholder="https://" aria-invalid={!!errors.bookingUrl} aria-describedby="item-url-error" {...form.register('bookingUrl')} />
              <FieldError id="item-url-error" message={errors.bookingUrl?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-ref">Booking reference</Label>
              <Input id="item-ref" {...form.register('bookingRef')} />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl bg-foreground/[0.04] p-4">
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span>
                <span className="block font-medium">Split a cost</span>
                <span className="block text-sm text-muted-foreground">Shows up in Expenses for everyone</span>
              </span>
              <Switch checked={hasCost} onCheckedChange={setHasCost} aria-label="This has a cost" />
            </label>
            {hasCost && <CostFields draft={draft} onChange={(d) => { setDraft(d); setCostError(null) }} idPrefix="item-cost" paidByLabel="Who booked it?" />}
            {costError && <p className="text-sm text-destructive" role="alert">{costError}</p>}
          </div>

            </>
          ) : (
            <button type="button" onClick={() => setMore(true)} className="min-h-11 text-[0.9375rem] font-medium text-primary">
              More details: notes, booking, cost
            </button>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : item ? 'Save' : 'Add'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
