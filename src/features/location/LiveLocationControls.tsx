import { Navigation } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useLiveLocation } from './LiveLocationProvider'
import { IOS_LOCATION_HELP } from './liveLocation'

/** Precise Location off on iPhone reports an error of several kilometres. */
const APPROXIMATE_M = 1_000

function useToggle() {
  const live = useLiveLocation()
  return async (on: boolean) => {
    const now = await live.setSharing(on)
    if (on && !now) {
      if (live.permission === 'unsupported') toast.error('This browser can’t share your location.')
      else toast.error('happs isn’t allowed to use your location.', { description: IOS_LOCATION_HELP, duration: 8_000 })
    } else if (on) toast.success('Sharing your live location with this trip')
    else toast('Stopped sharing your location')
  }
}

/** The settings-style row: "Share my live location" with a switch. */
export function LiveLocationRow() {
  const live = useLiveLocation()
  const toggle = useToggle()
  const hint =
    live.permission === 'unsupported'
      ? 'This browser can’t share your location.'
      : live.sharing
        ? live.myFix && live.myFix.accuracy > APPROXIMATE_M
          ? 'Sharing an approximate location. Turn on Precise Location for happs to share exactly where you are.'
          : 'Trip members can see you on the Map. It updates while happs is open.'
        : live.permission === 'denied'
          ? `Location access is off for happs. ${IOS_LOCATION_HELP}`
          : 'Let trip members see where you are on the Map, while happs is open on this phone.'
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-3">
      <span className="flex min-w-0 items-start gap-3">
        <Navigation className={cn('mt-0.5 size-5 shrink-0', live.sharing ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
        <span>
          <span className="block text-[1.0625rem]">Share my live location</span>
          <span className="block text-sm text-muted-foreground">{hint}</span>
        </span>
      </span>
      <Switch checked={live.sharing} disabled={live.permission === 'unsupported'} onCheckedChange={toggle} aria-label="Share my live location" />
    </label>
  )
}

/** The round map control: filled while sharing. */
export function LiveLocationButton() {
  const live = useLiveLocation()
  const toggle = useToggle()
  if (live.permission === 'unsupported') return null
  return (
    <button
      type="button"
      aria-pressed={live.sharing}
      aria-label={live.sharing ? 'Stop sharing my live location' : 'Share my live location'}
      onClick={() => toggle(!live.sharing)}
      className={cn('pointer-events-auto inline-flex size-12 items-center justify-center rounded-full', live.sharing ? 'bg-primary text-primary-foreground shadow-[0_2px_8px_rgb(0_0_0/0.25)]' : 'glass')}
    >
      <Navigation className={cn('size-5', live.sharing && 'fill-current')} />
    </button>
  )
}
