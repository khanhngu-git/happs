import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ClipboardPaste, ScanQrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseInviteCode } from './parseInvite'
import { QrScanner } from './QrScanner'
import { canScanQr } from './qrSupport'

/** Paste an invite link or code, then continue to the usual join preview. */
export function JoinTripDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText
  const [scanning, setScanning] = useState(false)
  const canScan = canScanQr()

  function go(input: string) {
    const code = parseInviteCode(input)
    if (!code) return setError('That doesn’t look like a happs invite link.')
    onOpenChange(false)
    navigate(`/join/${code}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          setValue('')
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join a trip</DialogTitle>
          <DialogDescription className="text-foreground/80">{canScan ? 'Scan the invite QR code, or paste the link a friend sent you.' : 'Paste the invite link a friend sent you. Got a QR code? Scan it with your camera.'}</DialogDescription>
        </DialogHeader>
        {canScan && (
          <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => setScanning(true)}>
            <ScanQrCode /> Scan QR code
          </Button>
        )}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            go(value)
          }}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="join-link">Invite link or code</Label>
            <div className="flex gap-2">
              <Input
                id="join-link"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://…/join/…"
                value={value}
                aria-invalid={!!error}
                aria-describedby="join-link-error"
                onChange={(e) => {
                  setValue(e.target.value)
                  setError(null)
                }}
              />
              {canPaste && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label="Paste from clipboard"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText()
                      setValue(text)
                      if (parseInviteCode(text)) go(text)
                    } catch {
                      setError('Couldn’t read the clipboard. Paste the link into the box instead.')
                    }
                  }}
                >
                  <ClipboardPaste className="size-5" />
                </Button>
              )}
            </div>
            {error && (
              <p id="join-link-error" className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={!value.trim()}>
            Continue
          </Button>
        </form>
      </DialogContent>
      <QrScanner
        open={scanning}
        onOpenChange={setScanning}
        onResult={(text) => {
          setScanning(false)
          if (parseInviteCode(text)) go(text)
          else {
            setValue(text.slice(0, 200))
            setError('That QR code isn’t a happs invite.')
          }
        }}
      />
    </Dialog>
  )
}
