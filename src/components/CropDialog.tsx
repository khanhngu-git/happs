import { useEffect, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cropToFile } from '@/lib/crop'

/**
 * "Move and scale": frame a photo to the shape it's shown in (square for a
 * profile photo, 16:9 for covers and plans) before it's saved. Drag to
 * position; pinch, scroll or use the slider to zoom.
 */
export function CropDialog({
  file,
  aspect,
  round = false,
  onCancel,
  onDone,
}: {
  file: File | null
  aspect: number
  round?: boolean
  onCancel(): void
  onDone(cropped: File): void
}) {
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move and scale</DialogTitle>
          <DialogDescription className="text-foreground/80">Drag to position, pinch or use the slider to zoom.</DialogDescription>
        </DialogHeader>
        {file && <CropBody key={`${file.name}-${file.size}-${file.lastModified}`} file={file} aspect={aspect} round={round} onCancel={onCancel} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  )
}

/** One photo being framed; remounted for each new photo so it starts centred. */
function CropBody({ file, aspect, round, onCancel, onDone }: { file: File; aspect: number; round: boolean; onCancel(): void; onDone(cropped: File): void }) {
  const [url] = useState(() => URL.createObjectURL(file))
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  // Free the photo's temporary URL once this is really gone. (React mounts twice
  // in development, so revoking straight away would break the image.)
  const revoke = useRef<number | undefined>(undefined)
  useEffect(() => {
    window.clearTimeout(revoke.current)
    return () => {
      revoke.current = window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }, [url])

  async function done() {
    if (!area) return
    setBusy(true)
    try {
      onDone(await cropToFile(url, area, file.name))
    } catch {
      // Couldn't crop in this browser: use the photo as it is (it's still centred and resized later).
      onDone(file)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
        <Cropper
          image={url}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          cropShape={round ? 'round' : 'rect'}
          showGrid={!round}
          objectFit="contain"
          minZoom={1}
          maxZoom={4}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setArea(pixels)}
        />
      </div>
      <div className="flex items-center gap-3 px-1">
        <button type="button" className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.25))}>
          <Minus className="size-5" />
        </button>
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" className="h-11 flex-1 accent-[var(--primary)]" />
        <button type="button" className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
          <Plus className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={done} disabled={!area || busy}>
          Choose
        </Button>
      </div>
    </>
  )
}
