import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { attachmentUrl } from '@/lib/uploads'
import type { Attachment } from '@/shared/schemas'

/**
 * Shows a ticket or PDF inside the app (no pop-up, so it also works in the
 * home-screen app and offline once the file has been opened before).
 */
export function FileViewer({ tripId, file, onClose }: { tripId: string; file: Attachment | null; onClose(): void }) {
  const [state, setState] = useState<{ key: string; url: string | null; error: string | null }>({ key: '', url: null, error: null })
  const key = file ? (file.fileId ?? file.url ?? file.name) : ''

  useEffect(() => {
    if (!file) return
    let url: string | null = null
    let live = true
    attachmentUrl(tripId, file).then(
      (u) => {
        url = u
        if (live) setState({ key, url: u, error: null })
      },
      (err: Error) => live && setState({ key, url: null, error: err.message || 'Couldn’t open that file.' }),
    )
    return () => {
      live = false
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tripId])

  const ready = state.key === key ? state : { url: null, error: null }
  const isPdf = file?.contentType === 'application/pdf'

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[96dvh]">
        <DialogHeader>
          <DialogTitle className="truncate pr-10">{file?.name}</DialogTitle>
          <DialogDescription className="sr-only">Ticket or document attached to this plan</DialogDescription>
        </DialogHeader>
        {ready.error ? (
          <p className="text-[0.9375rem] text-destructive">{ready.error}</p>
        ) : !ready.url ? (
          <div className="flex h-60 items-center justify-center" aria-busy>
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : isPdf ? (
          <iframe src={ready.url} title={file?.name} className="h-[65dvh] w-full rounded-xl bg-white" />
        ) : (
          <img src={ready.url} alt={file?.name} className="max-h-[65dvh] w-full rounded-xl object-contain" />
        )}
        {ready.url && (
          <Button asChild variant="secondary">
            <a href={ready.url} download={file?.name}>
              <Download /> Save to device
            </a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
