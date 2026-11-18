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
