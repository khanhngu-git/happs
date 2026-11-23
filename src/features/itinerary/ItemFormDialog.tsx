import { useEffect, useState } from 'react'
import { CropDialog } from '@/components/CropDialog'
import { ASPECT } from '@/lib/crop'
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
import { CostFields, useCostLocked } from '@/features/expenses/CostFields'
import { draftFromCost, emptyDraft, validateDraft, type CostDraft } from '@/features/expenses/costDraft'
import { SharesLockedError } from '@/features/expenses/expenseApi'
import type { Expense, Item } from '@/lib/firestore'
import type { ItemPrefill } from './prefill'
import { cn } from '@/lib/utils'
import { findOverlaps, ITEM_TYPES, type ItemType } from '@/shared/itinerary'
import { formatShortDate, formatTime, isDateString, isTimeString } from '@/shared/dates'
import { MAX_ATTACHMENTS, type Attachment, type Location } from '@/shared/schemas'
import { ITEM_TYPE_META } from './itemTypes'
import { PlacePicker } from './PlacePicker'
import { usePlaceBias } from './placeBias'
import { isMainlandChina } from './routes'
import { newItemId, saveItem } from './itineraryApi'
import { deleteAttachment, itemPhoto, saveItemAttachment } from '@/lib/uploads'
import { ImageError } from '@/lib/images'
import { FileText, ImagePlus, Loader2, Paperclip, TriangleAlert, X } from 'lucide-react'

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
  prefill = null,
  defaultDate,
  nextOrder,
  items = [],
}: {
  open: boolean
  onOpenChange(o: boolean): void
  item: Item | null
  linkedExpense: Expense | null
  /** Values for a new item, e.g. from the hotel finder. Ignored when editing. */
  prefill?: ItemPrefill | null
  defaultDate: string
  nextOrder: number
  /** The trip's other plans, for overlap warnings and place-search bias. */
  items?: Item[]
}) {
  const { trip, me, members } = useTrip()
  const pre = item ? null : prefill
  const bias = usePlaceBias(items, trip.destination)
  // A new plan gets its id up front, so it never "overlaps itself" once saved while the sheet closes.
  const [itemId] = useState(() => item?.id ?? newItemId(trip.id))
  const [location, setLocation] = useState<Location | null>(item?.location ?? pre?.location ?? null)
  const [toLocation, setToLocation] = useState<Location | null>(item?.toLocation ?? null)
  const [hasCost, setHasCost] = useState(!!linkedExpense || !!pre?.cost)
  const [draft, setDraft] = useState<CostDraft>(() =>
    linkedExpense ? draftFromCost(linkedExpense) : pre?.cost ? draftFromCost(pre.cost) : emptyDraft({ currency: trip.baseCurrency, paidBy: me, memberIds: members.map((m) => m.id) }),
  )
  const [costError, setCostError] = useState<string | null>(null)
  const costLocked = useCostLocked(trip.id, linkedExpense?.id)
  // Photo: a new File to upload, null to remove, undefined to keep what's there.
  const [photo, setPhoto] = useState<File | null | undefined>(undefined)
  const [cropping, setCropping] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(item?.photoURL ?? pre?.photoURL ?? null)
  useEffect(() => {
    if (!photo) return
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])
  const [more, setMore] = useState(!!(item?.notes || item?.bookingUrl || item?.bookingRef || item?.attachments?.length || linkedExpense || pre))
  // Tickets and confirmations. Removed files are deleted only after a successful save.
  const [attachments, setAttachments] = useState<Attachment[]>(item?.attachments ?? [])
  const [removedFiles, setRemovedFiles] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  async function attach(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      const room = MAX_ATTACHMENTS - attachments.length
      const added: Attachment[] = []
      for (const f of Array.from(files).slice(0, room)) added.push(await saveItemAttachment(trip.id, itemId, me, f))
      setAttachments((a) => [...a, ...added])
      if (files.length > room) toast.warning(`Up to ${MAX_ATTACHMENTS} files per plan.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t upload that file')
    } finally {
      setUploading(false)
    }
  }

  const form = useForm<Values>({ resolver: zodResolver(schema) })
  const { errors, isSubmitting } = form.formState
  const type = form.watch('type')
  const [wDate, wStart, wEnd] = form.watch(['date', 'startTime', 'endTime'])
  const overlaps =
    type === 'stay' || !wStart || !isTimeString(wStart)
      ? []
      : findOverlaps(items, { id: itemId, date: wDate, startTime: wStart, endTime: wEnd && isTimeString(wEnd) ? wEnd : null })

  // Reset whenever the dialog opens for a different item.
  useEffect(() => {
    if (!open) return
    form.reset({
      type: item?.type ?? pre?.type ?? 'activity',
      title: item?.title ?? pre?.title ?? '',
      date: item?.checkIn?.date ?? item?.date ?? pre?.date ?? defaultDate,
      startTime: (item?.type === 'stay' ? item.checkIn?.time : item?.startTime) ?? pre?.startTime ?? '',
      endTime: item?.endTime ?? '',
      checkOutDate: item?.checkOut?.date ?? pre?.checkOutDate ?? '',
      checkOutTime: item?.checkOut?.time ?? '',
      notes: item?.notes ?? pre?.notes ?? '',
      bookingUrl: item?.bookingUrl ?? '',
      bookingRef: item?.bookingRef ?? '',
    })
    setLocation(item?.location ?? pre?.location ?? null)
    setToLocation(item?.toLocation ?? null)
    setHasCost(!!linkedExpense || !!pre?.cost)
    setDraft(linkedExpense ? draftFromCost(linkedExpense) : pre?.cost ? draftFromCost(pre.cost) : emptyDraft({ currency: trip.baseCurrency, paidBy: me, memberIds: members.map((m) => m.id) }))
    setCostError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id, linkedExpense?.id, pre])

  const submit = form.handleSubmit(async (v) => {
    // Plans outside the trip's days wouldn't show anywhere in the itinerary.
    if (v.date < trip.startDate || v.date > trip.endDate) {
      form.setError('date', { message: `Pick a day during the trip (${formatShortDate(trip.startDate)} – ${formatShortDate(trip.endDate)})` })
      return
    }
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
      const id = itemId
      let photoURL = item?.photoURL ?? pre?.photoURL ?? null
      if (photo) photoURL = await itemPhoto(photo)
      else if (photo === null) photoURL = null
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
          toLocation: v.type === 'transport' ? toLocation : null,
          notes: v.notes,
          bookingUrl: v.bookingUrl,
          bookingRef: v.bookingRef,
          photoURL,
          // A new or removed photo isn't the credited one any more.
          photoCredit: photo === undefined ? (item?.photoCredit ?? null) : null,
          attachments,
        },
      })
      await Promise.all(removedFiles.map((a) => deleteAttachment(trip.id, a)))
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
                    if (f) setCropping(f)
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
                <Input id="item-date" type="date" min={trip.startDate} max={trip.endDate} aria-invalid={!!errors.date} aria-describedby="item-date-error" {...form.register('date')} />
                <Input aria-label="Check-in time" type="time" {...form.register('startTime')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-out">Check out</Label>
                <Input id="item-out" type="date" aria-invalid={!!errors.checkOutDate} aria-describedby="item-out-error" {...form.register('checkOutDate')} />
                <Input aria-label="Check-out time" type="time" {...form.register('checkOutTime')} />
              </div>
              <div className="col-span-2">
                <FieldError id="item-date-error" message={errors.date?.message} />
                <FieldError id="item-out-error" message={errors.checkOutDate?.message} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="item-date">Date</Label>
                <Input id="item-date" type="date" min={trip.startDate} max={trip.endDate} aria-invalid={!!errors.date} aria-describedby="item-date-error" {...form.register('date')} />
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
                <FieldError id="item-date-error" message={errors.date?.message} />
                <FieldError id="item-end-error" message={errors.endTime?.message} />
              </div>
              {overlaps.length > 0 && (
                <p className="col-span-3 flex gap-2 rounded-xl bg-warning/15 p-3 text-sm" role="status">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Overlaps with{' '}
                    {overlaps
                      .map((o) => `${o.title} (${formatTime(o.startTime!)}${o.endTime ? ` – ${formatTime(o.endTime)}` : ''})`)
                      .join(', ')}
                    . You can still save it.
                  </span>
                </p>
              )}
            </div>
          )}

          <PlacePicker
            id="item-place"
            label={type === 'transport' ? 'From' : 'Location'}
            value={location}
            onChange={setLocation}
            bias={bias}
            localLanguage={isMainlandChina(trip.timeZone) ? 'zh-CN' : null}
          />
          {type === 'transport' && (
            <PlacePicker id="item-place-to" label="To" value={toLocation} onChange={setToLocation} bias={bias} localLanguage={isMainlandChina(trip.timeZone) ? 'zh-CN' : null} />
          )}

          {more ? (
            <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Tickets and documents</legend>
            {attachments.length > 0 && (
              <ul className="divide-y divide-border/70 overflow-hidden rounded-xl bg-card ring-1 ring-input">
                {attachments.map((a) => (
                  <li key={a.fileId ?? a.url ?? a.name} className="flex min-h-11 items-center gap-2 pl-3">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[0.9375rem]">{a.name}</span>
                    <button
                      type="button"
                      className="inline-flex size-11 items-center justify-center rounded-full"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => {
                        setAttachments((x) => x.filter((y) => y !== a))
                        setRemovedFiles((r) => [...r, a])
                      }}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {attachments.length < MAX_ATTACHMENTS && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[0.9375rem] font-medium text-primary">
                {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />}
                {uploading ? 'Uploading…' : 'Attach a ticket or PDF'}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  multiple
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    void attach(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            )}
            <p className="text-sm text-muted-foreground">Boarding passes, QR codes, confirmations. Saved on your phone once opened, so they work offline.</p>
          </fieldset>

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
              <Switch checked={hasCost} onCheckedChange={setHasCost} disabled={costLocked} aria-label="This has a cost" />
            </label>
            {hasCost && <CostFields draft={draft} onChange={(d) => { setDraft(d); setCostError(null) }} idPrefix="item-cost" paidByLabel="Who booked it?" locked={costLocked} />}
            {costError && <p className="text-sm text-destructive" role="alert">{costError}</p>}
          </div>

            </>
          ) : (
            <button type="button" onClick={() => setMore(true)} className="min-h-11 text-[0.9375rem] font-medium text-primary">
              More details: notes, booking, cost
            </button>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || uploading}>
            {isSubmitting ? 'Saving…' : item ? 'Save' : 'Add'}
          </Button>
        </form>
        <CropDialog
          file={cropping}
          aspect={ASPECT.item}
          onCancel={() => setCropping(null)}
          onDone={(f) => {
            setCropping(null)
            setPhoto(f)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
