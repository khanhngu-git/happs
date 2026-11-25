import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { signUp, testUser } from './helpers'

/**
 * Live location on the map: Sam shares, Alex taps Sam's pin for directions,
 * then long-presses the map to drop a pin and adds it to the itinerary.
 * Needs a Google Maps key and Map ID in the env; skipped without one.
 */
test('tap a member for directions, long-press to drop a pin', async ({ browser }) => {
  test.skip(!process.env.VITE_GOOGLE_MAPS_API_KEY && !/^VITE_GOOGLE_MAPS_API_KEY=./m.test(readFileSync('.env', 'utf8')), 'no Maps key')
  const alex = testUser('Mapper')
  const sam = testUser('Sharer')
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: -33.8568, longitude: 151.2153 } })
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()

  await signUp(a, alex)
  await a.goto('/trips/new')
  await a.getByLabel('Trip name').fill('E2E Sydney')
  await a.getByLabel('Destination').fill('Sydney, Australia')
  await a.getByLabel('Starts').fill('2026-12-05')
  await a.getByLabel('Ends').fill('2026-12-08')
  await a.getByLabel('Time zone').selectOption('Australia/Sydney')
  await a.getByLabel('Base currency').selectOption('AUD')
  await a.getByRole('button', { name: 'Create trip' }).click()
  await a.getByRole('button', { name: 'Create invite link' }).click()
  const link = await a.getByRole('dialog').locator('p.font-mono').textContent()
  const joinPath = new URL(link!).pathname
  await a.keyboard.press('Escape')

  await b.goto(joinPath)
  await signUp(b, sam, joinPath)
  await b.getByRole('button', { name: 'Join trip' }).click()
  await expect(b).toHaveURL(/\/itinerary/)

  // Sam turns on sharing.
  await b.getByRole('link', { name: 'Members' }).click()
  await b.getByRole('switch', { name: 'Share my live location' }).click()
  await expect(b.getByRole('switch', { name: 'Share my live location' })).toBeChecked()

  // Alex sees Sam on the map and taps them.
  await a.getByRole('link', { name: 'Map' }).click()
  const samPin = a.locator(`gmp-advanced-marker[title^="${sam.name}"]`)
  await expect(samPin).toBeAttached({ timeout: 20_000 })
  await samPin.click()
  const card = a.getByRole('dialog', { name: sam.name })
  await expect(card).toBeVisible()
  await expect(card.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', /destination=-33\.8568%2C151\.2153/)
  await card.getByRole('button', { name: 'Close' }).click()
  await expect(card).toBeHidden()

  // Long-press empty map with a finger: a pin drops and its card opens.
  const box = (await a.locator('.gm-style').first().boundingBox())!
  const x = box.x + box.width * 0.3
  const y = box.y + box.height * 0.45
  const cdp = await ctxA.newCDPSession(a)
  const hold = async (px: number, py: number, ms: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py }] })
    await a.waitForTimeout(ms)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await hold(x, y, 800)
  const pinCard = a.getByRole('dialog', { name: 'Dropped pin' })
  await expect(pinCard).toBeVisible()
  await expect(a).toHaveURL(/pin=-?\d+\.\d+%2C-?\d+\.\d+/)
  await expect(pinCard.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', /destination=-?\d/)

  // A short tap doesn't drop a pin; it closes the card.
  await a.waitForTimeout(700)
  await a.touchscreen.tap(box.x + box.width * 0.75, box.y + box.height * 0.3)
  await expect(pinCard).toBeHidden()

  // Drop again and add it to the plan.
  await hold(x, y, 800)
  await a.getByRole('dialog', { name: 'Dropped pin' }).getByRole('button', { name: 'Add to itinerary' }).click()
  await expect(a.getByRole('dialog').getByPlaceholder('The Bund at night')).toBeVisible()

  // Sam stops sharing; the pin goes away for Alex.
  await b.getByRole('switch', { name: 'Share my live location' }).click()
  await a.keyboard.press('Escape')
  await expect(samPin).toHaveCount(0, { timeout: 10_000 })
})
