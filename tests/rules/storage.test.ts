import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, type Firestore } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'
import { MEMBER, OUTSIDER, OWNER, TRIP, tripData } from './setup'

let env: RulesTestEnvironment
beforeAll(async () => {
  const [fh, fp] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  const [sh, sp] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199').split(':')
  env = await initializeTestEnvironment({
    // Must match the emulator's project so cross-service firestore.get() sees the seeded trip.
    projectId: 'demo-happs-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: fh, port: Number(fp) },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: sh, port: Number(sp) },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, 'trips', TRIP), tripData({ memberIds: [OWNER, MEMBER] }))
  })
})

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const st = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage()
const put = (uid: string | null, path: string, type = 'image/jpeg', data: Uint8Array = jpeg) => uploadBytes(ref(st(uid), path), data, { contentType: type })

describe('profile photos', () => {
  it('a user uploads only their own avatar, images only', async () => {
    await assertSucceeds(put(MEMBER, `users/${MEMBER}/avatar-1.jpg`))
    await assertFails(put(OWNER, `users/${MEMBER}/avatar-2.jpg`))
    await assertFails(put(null, `users/${MEMBER}/avatar-3.jpg`))
    await assertFails(put(MEMBER, `users/${MEMBER}/evil.html`, 'text/html'))
    await assertFails(put(MEMBER, `users/${MEMBER}/huge.jpg`, 'image/jpeg', new Uint8Array(5 * 1024 * 1024 + 1)))
  })
  it('signed-in users can read avatars; owners delete their own', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `users/${MEMBER}/avatar-1.jpg`), jpeg, { contentType: 'image/jpeg' })
    })
    await assertSucceeds(getBytes(ref(st(OUTSIDER), `users/${MEMBER}/avatar-1.jpg`)))
    await assertFails(getBytes(ref(st(null), `users/${MEMBER}/avatar-1.jpg`)))
    await assertFails(deleteObject(ref(st(OWNER), `users/${MEMBER}/avatar-1.jpg`)))
    await assertSucceeds(deleteObject(ref(st(MEMBER), `users/${MEMBER}/avatar-1.jpg`)))
  })
})

describe('trip covers', () => {
  it('only the trip owner uploads or deletes the cover', async () => {
    await assertSucceeds(put(OWNER, `trips/${TRIP}/cover-1.jpg`))
    await assertFails(put(MEMBER, `trips/${TRIP}/cover-2.jpg`))
    await assertFails(put(OUTSIDER, `trips/${TRIP}/cover-3.jpg`))
    await assertFails(deleteObject(ref(st(MEMBER), `trips/${TRIP}/cover-1.jpg`)))
    await assertSucceeds(deleteObject(ref(st(OWNER), `trips/${TRIP}/cover-1.jpg`)))
  })
  it('members read the cover through the SDK; outsiders cannot', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `trips/${TRIP}/cover-1.jpg`), jpeg, { contentType: 'image/jpeg' })
    })
    await assertSucceeds(getBytes(ref(st(MEMBER), `trips/${TRIP}/cover-1.jpg`)))
    await assertFails(getBytes(ref(st(OUTSIDER), `trips/${TRIP}/cover-1.jpg`)))
  })
})

describe('activity photos', () => {
  it('any member adds, replaces or removes an activity photo; outsiders cannot', async () => {
    await assertSucceeds(put(MEMBER, `trips/${TRIP}/items/i1-1.jpg`))
    await assertSucceeds(put(OWNER, `trips/${TRIP}/items/i2-1.jpg`))
    await assertFails(put(OUTSIDER, `trips/${TRIP}/items/i3-1.jpg`))
    await assertFails(put(MEMBER, `trips/${TRIP}/items/i4.txt`, 'text/plain'))
    await assertFails(deleteObject(ref(st(OUTSIDER), `trips/${TRIP}/items/i1-1.jpg`)))
    await assertSucceeds(deleteObject(ref(st(MEMBER), `trips/${TRIP}/items/i1-1.jpg`)))
  })
  it('members attach PDFs as plan documents, but not as photos', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4 test')
    await assertSucceeds(put(MEMBER, `trips/${TRIP}/items/i1-doc-1-ticket.pdf`, 'application/pdf', pdf))
    await assertFails(put(OUTSIDER, `trips/${TRIP}/items/i1-doc-2-ticket.pdf`, 'application/pdf', pdf))
    await assertFails(put(MEMBER, `trips/${TRIP}/items/i1-3.pdf`, 'application/pdf', pdf))
    await assertFails(put(MEMBER, `trips/${TRIP}/items/i1-doc-4-x.zip`, 'application/zip', pdf))
  })
})
