import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { useUser } from '@/features/auth/AuthProvider'
import { useTrip } from '@/features/trips/TripContext'
import { createInvite, inviteUrl, shareLink } from './inviteApi'

/** Create an invite link, or (with `existingCode`) show one again: its QR code and link. */
export function InviteDialog({ open, onOpenChange, existingCode = null }: { open: boolean; onOpenChange(o: boolean): void; existingCode?: string | null }) {
  const user = useUser()
  const { trip, members } = useTrip()
  const [expires, setExpires] = useState('7')
  const [maxUses, setMaxUses] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const current = existingCode ?? code
  const url = current ? inviteUrl(current) : ''

  async function create() {
    setBusy(true)
    try {
      setCode(await createInvite(trip, user.uid, members.find((m) => m.id === user.uid)?.displayName || user.displayName || 'Someone', { expiresInDays: expires ? Number(expires) : null, maxUses: maxUses ? Number(maxUses) : null }))
    } catch (err) {
      console.error(err)
      toast.error('Couldn’t create the invite link.')
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    const r = await shareLink(url, trip.name).catch(() => 'cancelled' as const)
    if (r === 'copied') toast.success('Link copied')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setCode(null)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite friends</DialogTitle>
          <DialogDescription className="text-foreground/80">Anyone with the link can join {trip.name}.</DialogDescription>
        </DialogHeader>
        {!current ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="inv-exp">Link expires</Label>
                <NativeSelect id="inv-exp" value={expires} onChange={(e) => setExpires(e.target.value)}>
                  <option value="1">In 1 day</option>
                  <option value="7">In 7 days</option>
                  <option value="30">In 30 days</option>
                  <option value="">Never</option>
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-max">Max people</Label>
                <NativeSelect id="inv-max" value={maxUses} onChange={(e) => setMaxUses(e.target.value)}>
                  <option value="">No limit</option>
                  <option value="1">1 person</option>
                  <option value="5">5 people</option>
                  <option value="10">10 people</option>
                </NativeSelect>
              </div>
            </div>
            <Button size="lg" className="w-full" onClick={create} disabled={busy}>
              {busy ? 'Creating…' : 'Create invite link'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="mx-auto w-fit rounded-3xl bg-white p-4">
              <QRCodeSVG value={url} size={184} marginSize={0} title={`QR code for ${url}`} />
            </div>
            <p className="rounded-xl bg-foreground/[0.06] px-3 py-2.5 text-center font-mono text-sm break-all select-all">{url}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" onClick={share}>
                <Share2 /> Share
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Link copied'), () => toast.error('Couldn’t copy'))}
              >
                <Copy /> Copy
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
