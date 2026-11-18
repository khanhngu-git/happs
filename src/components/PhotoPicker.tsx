import { useCallback, useId, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ImageError } from '@/lib/images'

/**
 * Wraps any trigger in a hidden file input. On iPhone this opens the native
 * sheet (Photo Library / Take Photo / Choose File).
 */
export function PhotoPicker({ onPick, children, label }: { onPick(file: File): Promise<void>; children(busy: boolean, open: () => void): ReactNode; label: string }) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const open = useCallback(() => document.getElementById(id)?.click(), [id])
  return (
    <>
      <input
        id={id}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={label}
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          try {
            await onPick(file)
          } catch (err) {
            console.error(err)
            toast.error(err instanceof ImageError ? err.message : 'Couldn’t upload the photo. Try again.')
          } finally {
            setBusy(false)
          }
        }}
      />
      {children(busy, open)}
    </>
  )
}
