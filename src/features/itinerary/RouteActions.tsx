import { useState } from 'react'
import { CarTaxiFront, Copy, Navigation } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTrip } from '@/features/trips/TripContext'
import { cn } from '@/lib/utils'
import type { Location } from '@/shared/schemas'
import { openAmapOnIOS } from './openAmap'
import { amapUrl, DIDI_APP_URL, driverText, googleDirectionsUrl, isMainlandChina } from './routes'

/**
 * "How do I get there?" in one tap: Google Maps everywhere, plus Amap and a
 * taxi/DiDi card in mainland China, where Google Maps is unreliable.
 */
export function RouteActions({ to, from, size = 'default', className }: { to: Location; from?: Location | null; size?: 'default' | 'sm'; className?: string }) {
  const { trip } = useTrip()
  const [driver, setDriver] = useState(false)
  const china = isMainlandChina(trip.timeZone, to)
  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        <Button asChild size={size} variant={china ? 'secondary' : 'default'} className={size === 'default' ? 'flex-1' : undefined}>
          <a href={googleDirectionsUrl(to, from)} target="_blank" rel="noreferrer">
            <Navigation /> {china ? 'Google' : 'Directions'}
          </a>
        </Button>
        {china && (
          <>
            <Button asChild size={size} className={size === 'default' ? 'flex-1' : undefined}>
              <a href={amapUrl(to, from)} target="_blank" rel="noreferrer" aria-label="Directions in Amap" onClick={(e) => openAmapOnIOS(e, to, from)}>
                <Navigation /> Amap 高德
              </a>
            </Button>
            <Button size={size} variant="secondary" className={size === 'default' ? 'flex-1' : undefined} onClick={() => setDriver(true)}>
              <CarTaxiFront /> Taxi / DiDi
            </Button>
          </>
        )}
      </div>
      {china && <DriverCard open={driver} onOpenChange={setDriver} to={to} />}
    </>
  )
}

/** Big, readable destination to show a taxi driver or paste into DiDi. */
function DriverCard({ open, onOpenChange, to }: { open: boolean; onOpenChange(o: boolean): void; to: Location }) {
  const { name, address } = driverText(to)
  const text = [name, address].filter(Boolean).join('\n')
  const hasLocal = !!(to.localName || to.localAddress)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Show this to your driver</DialogTitle>
          <DialogDescription>{hasLocal ? 'Or copy it and paste it as the destination in DiDi.' : 'We don’t have this place’s Chinese name. Pick it again from the search to fetch it.'}</DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border/70" lang={hasLocal ? 'zh-CN' : undefined}>
          <p className="text-[1.75rem] leading-tight font-bold">{name}</p>
          {address && <p className="mt-2 text-[1.25rem] leading-snug">{address}</p>}
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            navigator.clipboard.writeText(text).then(
              () => toast.success('Copied. Paste it into DiDi.'),
              () => toast.error('Couldn’t copy'),
            )
          }
        >
          <Copy /> Copy destination
        </Button>
        <Button asChild>
          <a
            href={DIDI_APP_URL}
            onClick={() => {
              // Copy first so the destination is ready to paste once DiDi opens.
              void navigator.clipboard?.writeText(text).catch(() => {})
            }}
          >
            <CarTaxiFront /> Copy and open DiDi
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  )
}
