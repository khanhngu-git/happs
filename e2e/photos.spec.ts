import { expect, test } from '@playwright/test'
import { signUp, testUser } from './helpers'

const IMAGE = 'public/pwa-512x512.png'

test('profile photo and trip cover are saved in Firestore', async ({ page }) => {
  await signUp(page, testUser('Photo'))

  // Profile photo: pick a file, it's resized and saved as a small JPEG.
  await page.goto('/profile')
  await page.getByLabel('Choose a profile photo').setInputFiles(IMAGE)
  await expect(page.getByText('Photo updated')).toBeVisible()
  const avatar = page.getByRole('button', { name: 'Change profile photo' }).locator('img')
  await expect(avatar).toHaveAttribute('src', /^data:image\/jpeg;base64,/)
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible()

  // Trip cover: chosen while creating, saved with the trip.
  await page.goto('/trips/new')
  await page.getByLabel('Trip name').fill('Cover photo trip')
  await page.getByLabel('Starts').fill('2026-12-01')
  await page.getByLabel('Ends').fill('2026-12-03')
  await page.locator('label:has-text("Add a cover photo") input[type=file]').setInputFiles(IMAGE)
  await expect(page.getByRole('img', { name: 'Trip cover' })).toBeVisible()
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page).toHaveURL(/\/members/)
  await page.keyboard.press('Escape')
  await page.goto('/')
  await expect(page.locator('a:has-text("Cover photo trip") img').first()).toHaveAttribute('src', /^data:image\/jpeg;base64,/)
})

test('activity photo shows in the day view, and Today brings you back', async ({ page }) => {
  await signUp(page, testUser('Live'))
  // A trip happening right now, in this device's time zone.
  const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  const now = new Date()
  const start = iso(new Date(now.getTime() - 86_400_000))
  const end = iso(new Date(now.getTime() + 2 * 86_400_000))
  await page.goto('/trips/new')
  await page.getByLabel('Trip name').fill('Live trip')
  await page.getByLabel('Starts').fill(start)
  await page.getByLabel('Ends').fill(end)
  await page.getByLabel('Time zone').selectOption(Intl.DateTimeFormat().resolvedOptions().timeZone)
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page.getByRole('dialog', { name: 'Invite friends' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Itinerary' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()

  // Add an activity with a photo; the row shows the photo thumbnail.
  await page.getByRole('button', { name: 'Add to the plan' }).click()
  await page.getByPlaceholder('The Bund at night').fill('Sunset walk')
  await page.getByLabel('Add a photo').setInputFiles(IMAGE)
  await expect(page.getByRole('img', { name: 'Activity photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Sunset walk')).toBeVisible()
  await expect(page.locator('li:has-text("Sunset walk") img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/)

  // Look at another day, then jump back with Today.
  await page.getByRole('tab', { name: /^Day 3,/ }).click()
  await expect(page.getByRole('heading', { name: 'Day 3' })).toBeVisible()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Today', exact: true })).toHaveCount(0)
})
