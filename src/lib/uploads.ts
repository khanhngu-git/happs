import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './firebase'
import { prepareImage } from './images'

/**
 * Each upload gets a fresh filename so caches never show a stale photo;
 * the previous file is deleted afterwards (best effort).
 */
async function upload(path: string, blob: Blob, previousUrl: string | null | undefined): Promise<string> {
  const r = ref(storage, path)
  await uploadBytes(r, blob, { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' })
  const url = await getDownloadURL(r)
  if (previousUrl) await removeByUrl(previousUrl)
  return url
}

export async function removeByUrl(url: string): Promise<void> {
  if (!url.includes('firebasestorage') && !url.includes(':9199')) return // e.g. a Google profile photo
  try {
    await deleteObject(ref(storage, url))
  } catch {
    /* already gone, or not ours */
  }
}

export async function uploadAvatar(uid: string, file: File, previousUrl?: string | null): Promise<string> {
  const blob = await prepareImage(file, { maxSize: 512, square: true })
  return upload(`users/${uid}/avatar-${Date.now()}.jpg`, blob, previousUrl)
}

export async function uploadTripCover(tripId: string, file: File, previousUrl?: string | null): Promise<string> {
  const blob = await prepareImage(file, { maxSize: 1600, quality: 0.82 })
  return upload(`trips/${tripId}/cover-${Date.now()}.jpg`, blob, previousUrl)
}
