import { getAppStorage } from './firebase'
import { prepareImage } from './images'

/**
 * Each upload gets a fresh filename so caches never show a stale photo;
 * the previous file is deleted afterwards (best effort).
 */
async function upload(path: string, blob: Blob, previousUrl: string | null | undefined): Promise<string> {
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
  const r = ref(await getAppStorage(), path)
  await uploadBytes(r, blob, { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' })
  const url = await getDownloadURL(r)
  if (previousUrl) await removeByUrl(previousUrl)
  return url
}

export async function removeByUrl(url: string): Promise<void> {
  if (!url.includes('firebasestorage') && !url.includes(':9199')) return // e.g. a Google profile photo
  try {
    const { deleteObject, ref } = await import('firebase/storage')
    await deleteObject(ref(await getAppStorage(), url))
  } catch {
    /* already gone, or not ours */
  }
}

export async function uploadAvatar(uid: string, file: File, previousUrl?: string | null): Promise<string> {
  const blob = await prepareImage(file, { maxSize: 512, square: true })
  return upload(`users/${uid}/avatar-${Date.now()}.jpg`, blob, previousUrl)
}

export async function uploadItemPhoto(tripId: string, itemId: string, file: File, previousUrl?: string | null): Promise<string> {
  const blob = await prepareImage(file, { maxSize: 1280, quality: 0.82 })
  return upload(`trips/${tripId}/items/${itemId}-${Date.now()}.jpg`, blob, previousUrl)
}

export async function uploadTripCover(tripId: string, file: File, previousUrl?: string | null): Promise<string> {
  const blob = await prepareImage(file, { maxSize: 1600, quality: 0.82 })
  return upload(`trips/${tripId}/cover-${Date.now()}.jpg`, blob, previousUrl)
}

/** A ticket or confirmation for a plan, uploaded as is (PDF or photo). */
export async function uploadItemAttachment(tripId: string, itemId: string, file: File): Promise<{ name: string; url: string; contentType: string; size: number }> {
  if (!/^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/.test(file.type)) throw new Error('Only PDFs and photos can be attached.')
  if (file.size >= 10 * 1024 * 1024) throw new Error('That file is over 10 MB.')
  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'document'
  const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
  const r = ref(await getAppStorage(), `trips/${tripId}/items/${itemId}-doc-${Date.now()}-${safe}`)
  await uploadBytes(r, file, { contentType: file.type, contentDisposition: `inline; filename="${safe}"` })
  return { name: file.name.slice(0, 200), url: await getDownloadURL(r), contentType: file.type, size: file.size }
}
