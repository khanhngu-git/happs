import { useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { db } from '@/lib/firebase'
import { useUser } from '@/features/auth/AuthProvider'

/** Writes to `feedback` with app version and device info for the beta group. */
export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const user = useUser()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription className="text-foreground/80">Found a bug or have an idea? We read everything.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="fb-msg">Your message</Label>
          <Textarea id="fb-msg" rows={5} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
          <p className="text-sm text-muted-foreground">We include the app version and your browser so we can reproduce issues.</p>
        </div>
        <Button
          size="lg"
          disabled={busy || !message.trim()}
          onClick={async () => {
            setBusy(true)
            try {
              await addDoc(collection(db, 'feedback'), {
                uid: user.uid,
                message: message.trim(),
                appVersion: __APP_VERSION__,
                userAgent: navigator.userAgent.slice(0, 500),
                url: location.pathname.slice(0, 500),
                createdAt: serverTimestamp(),
              })
              toast.success('Thanks! Feedback sent.')
              setMessage('')
              onOpenChange(false)
            } catch {
              toast.error('Couldn’t send. Try again.')
            } finally {
              setBusy(false)
            }
          }}
        >
          Send feedback
        </Button>
      </DialogContent>
    </Dialog>
  )
}
