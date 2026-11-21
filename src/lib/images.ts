/**
 * Client-side image preparation: decode (respecting EXIF orientation), crop
 * or fit, and re-encode as JPEG so uploads are small and consistent. iPhone
 * HEIC photos arrive as JPEG from `<input accept="image/*">` in Safari.
 */
export class ImageError extends Error {}

export async function prepareImage(file: File, opts: { maxSize: number; square?: boolean; quality?: number }): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new ImageError('Choose a photo (JPEG, PNG, HEIC or WebP).')
  if (file.size > 25 * 1024 * 1024) throw new ImageError('That photo is too large. Pick one under 25 MB.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new ImageError('Couldn’t read that photo. Try a JPEG or PNG.')
  }
  const { width: w, height: h } = bitmap
  // Source rectangle: centre square for avatars, the whole image otherwise.
  const side = Math.min(w, h)
  const [sx, sy, sw, sh] = opts.square ? [(w - side) / 2, (h - side) / 2, side, side] : [0, 0, w, h]
  const scale = Math.min(1, opts.maxSize / Math.max(sw, sh))
  const cw = Math.round(sw * scale)
  const ch = Math.round(sh * scale)
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, cw, ch)
  bitmap.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', opts.quality ?? 0.85))
  if (!blob) throw new ImageError('Couldn’t process that photo.')
  return blob
}

/**
 * Encode a photo as a JPEG data URL no longer than `maxChars`, shrinking the
 * quality and then the size until it fits. Photos live inside Firestore
 * documents (1 MiB each), so every image has a byte budget.
 */
export async function imageDataUrl(file: File | Blob, opts: { maxSize: number; maxChars: number; square?: boolean }): Promise<string> {
  const f = file instanceof File ? file : new File([file], 'image', { type: file.type || 'image/jpeg' })
  let size = opts.maxSize
  for (let attempt = 0; attempt < 8; attempt++) {
    for (const quality of [0.82, 0.7, 0.58]) {
      const blob = await prepareImage(f, { maxSize: size, square: opts.square, quality })
      const url = await blobToDataUrl(blob)
      if (url.length <= opts.maxChars) return url
    }
    size = Math.round(size * 0.75)
  }
  throw new ImageError('Couldn’t make that photo small enough. Try another one.')
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error ?? new Error('Couldn’t read the file.'))
    r.readAsDataURL(blob)
  })
}
