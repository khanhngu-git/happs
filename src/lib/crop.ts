import type { Area } from 'react-easy-crop'

/** Largest side of a cropped photo before it's compressed for storage. */
const MAX_SIDE = 2400

/** Cut `area` (in the image's own pixels) out of the photo at `url` as a JPEG file. */
export async function cropToFile(url: string, area: Area, name: string): Promise<File> {
  const img = new Image()
  img.src = url
  await img.decode()
  const scale = Math.min(1, MAX_SIDE / Math.max(area.width, area.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(area.width * scale))
  canvas.height = Math.max(1, Math.round(area.height * scale))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
  if (!blob) throw new Error('Couldn’t crop that photo')
  return new File([blob], name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
}

/** The shape each kind of photo is shown in. */
export const ASPECT = { avatar: 1, cover: 16 / 9, item: 16 / 9 } as const
