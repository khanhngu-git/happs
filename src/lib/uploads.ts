/**
 * Photos and documents are stored in Firestore itself (no Cloud Storage, so
 * the app runs on Firebase's free Spark plan):
 * - Photos (profile, trip cover, plan) are small JPEG data URLs kept on the
 *   document that shows them, so every existing `<img src>` just works.
 * - Tickets and PDFs go in `trips/{tripId}/files/{fileId}` as base64, one file
 *   per document, and are opened on demand. Firestore's offline cache keeps
 *   them on the phone once they've been opened.
 */
import { collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { ImageError, blobToDataUrl, imageDataUrl } from './images'
import type { Attachment } from '@/shared/schemas'

/** Character budgets for photos stored inline (base64 is ~4/3 of the bytes). */
export const PHOTO_LIMITS = {
  avatar: { maxSize: 320, maxChars: 60_000, square: true },
  item: { maxSize: 1024, maxChars: 160_000 },
  cover: { maxSize: 1280, maxChars: 240_000 },
} as const

/** A file document holds at most this much base64 (Firestore caps a document at 1 MiB). */
export const MAX_FILE_CHARS = 900_000
/** Largest PDF that fits once encoded. */
export const MAX_PDF_BYTES = Math.floor((MAX_FILE_CHARS * 3) / 4) - 1024

export const avatarPhoto = (file: File) => imageDataUrl(file, PHOTO_LIMITS.avatar)
export const itemPhoto = (file: File) => imageDataUrl(file, PHOTO_LIMITS.item)
export const coverPhoto = (file: File) => imageDataUrl(file, PHOTO_LIMITS.cover)

export class FileTooLargeError extends Error {}

/** A ticket or confirmation for a plan: photos are compressed to fit, PDFs must already be small enough. */
export async function saveItemAttachment(tripId: string, itemId: string, uid: string, file: File): Promise<Attachment> {
  let dataUrl: string
  let contentType = file.type
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) {
      throw new FileTooLargeError(`That PDF is ${(file.size / 1024).toFixed(0)} KB. PDFs can be up to ${Math.floor(MAX_PDF_BYTES / 1024)} KB, so attach a screenshot of it instead.`)
    }
    dataUrl = await blobToDataUrl(file)
  } else if (file.type.startsWith('image/')) {
    dataUrl = await imageDataUrl(file, { maxSize: 2000, maxChars: MAX_FILE_CHARS })
    contentType = 'image/jpeg'
  } else {
    throw new ImageError('Only PDFs and photos can be attached.')
  }
  const data = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const ref = doc(collection(db, 'trips', tripId, 'files'))
  const name = file.name.slice(0, 200) || 'document'
  await setDoc(ref, { itemId, name, contentType, size: Math.round((data.length * 3) / 4), data, createdBy: uid, createdAt: serverTimestamp() })
  return { name, fileId: ref.id, contentType, size: Math.round((data.length * 3) / 4) }
}

export async function deleteAttachment(tripId: string, a: Attachment): Promise<void> {
  if (!a.fileId) return
  await deleteDoc(doc(db, 'trips', tripId, 'files', a.fileId)).catch(() => undefined)
}

/** Load an attached file and return a local URL for it (revoke when done). */
export async function attachmentUrl(tripId: string, a: Attachment): Promise<string> {
  if (a.url) return a.url
  const snap = await getDoc(doc(db, 'trips', tripId, 'files', a.fileId!))
  if (!snap.exists()) throw new Error('This file has been removed.')
  const { data, contentType } = snap.data() as { data: string; contentType: string }
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: contentType }))
}

/** Read each file once so Firestore's offline cache has it. */
export function preloadAttachments(tripId: string, list: Attachment[]): void {
  for (const a of list) if (a.fileId) void getDoc(doc(db, 'trips', tripId, 'files', a.fileId)).catch(() => undefined)
}
