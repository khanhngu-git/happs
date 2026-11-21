import { useEffect, useRef, useState } from 'react'
import { CameraOff, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { makeQrReader } from './qrSupport'

/**
 * Point the camera at an invite QR code. Calls onResult with the first code it
 * reads; the camera turns off as soon as the sheet closes.
 */
export function QrScanner({ open, onOpenChange, onResult }: { open: boolean; onOpenChange(o: boolean): void; onResult(text: string): void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'starting' | 'scanning' | 'error'>('starting')
  const [error, setError] = useState('')
  const done = useRef(onResult)
  useEffect(() => {
    done.current = onResult
  }, [onResult])

  useEffect(() => {
    if (!open) return
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        const video = videoRef.current!
        video.srcObject = stream
        await video.play()
        const read = await makeQrReader()
        setState('scanning')
        const tick = async () => {
          if (stopped) return
          const text = await read(video, canvas)
          if (stopped) return
          if (text) {
            stopped = true
            done.current(text)
            return
          }
          timer = window.setTimeout(tick, 150)
        }
        void tick()
      } catch (err) {
        if (stopped) return
        const name = (err as Error).name
        setError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'Camera access is turned off for happs. Allow it in your browser or phone settings, or paste the invite link instead.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No camera was found on this device. Paste the invite link instead.'
              : 'Couldn’t start the camera. Paste the invite link instead.',
        )
        setState('error')
      }
    })()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
      setState('starting')
      setError('')
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan invite QR code</DialogTitle>
          <DialogDescription className="text-foreground/80">Point your camera at the QR code a friend is showing you.</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} playsInline muted autoPlay className="size-full object-cover" aria-label="Camera view" />
          {state === 'scanning' && (
            <span className="pointer-events-none absolute inset-[14%] rounded-3xl ring-4 ring-white/85 shadow-[0_0_0_100vmax_rgba(0,0,0,0.35)]" aria-hidden />
          )}
          {state === 'starting' && (
            <span className="absolute inset-0 flex items-center justify-center text-white" aria-busy>
              <Loader2 className="size-7 animate-spin" />
            </span>
          )}
          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white" role="alert">
              <CameraOff className="size-8" aria-hidden />
              <p className="text-[0.9375rem]">{error}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
