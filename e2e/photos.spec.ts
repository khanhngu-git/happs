import { expect, test } from '@playwright/test'
import { signUp, testUser } from './helpers'

const IMAGE = 'public/pwa-512x512.png'

test('profile photo and trip cover upload to Storage', async ({ page }) => {
  await signUp(page, testUser('Photo'))

  // Profile photo: pick a file, it's resized, uploaded and shown.
  await page.goto('/profile')
  await page.getByLabel('Choose a profile photo').setInputFiles(IMAGE)
  await expect(page.getByText('Photo updated')).toBeVisible()
  const avatar = page.getByRole('button', { name: 'Change profile photo' }).locator('img')
  await expect(avatar).toHaveAttribute('src', /users%2F.+%2Favatar-\d+\.jpg/)
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible()

  // Trip cover: chosen while creating, uploaded once the trip exists.
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
  await expect(page.locator('a:has-text("Cover photo trip") img').first()).toHaveAttribute('src', /trips%2F.+%2Fcover-\d+\.jpg/)
})
