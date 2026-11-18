import { expect, test } from '@playwright/test'
import { signUp, testUser } from './helpers'

/**
 * The core happy path across two people:
 * sign up → create trip → invite → second user joins → add item with cost →
 * debtor marks paid → payer confirms.
 */
test('two friends plan a trip and settle a cost', async ({ browser }) => {
  const alex = testUser('Alex')
  const sam = testUser('Sam')
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()

  // 1. Alex signs up and creates a trip.
  await signUp(a, alex)
  await a.goto('/trips/new')
  await a.getByLabel('Trip name').fill('E2E Shanghai')
  await a.getByLabel('Destination').fill('Shanghai, China')
  await a.getByLabel('Starts').fill('2026-12-05')
  await a.getByLabel('Ends').fill('2026-12-08')
  await a.getByLabel('Time zone').selectOption('Asia/Shanghai')
  await a.getByLabel('Base currency').selectOption('AUD')
  await a.getByRole('button', { name: 'Create trip' }).click()

  // 2. The invite sheet opens straight away; create a link.
  await a.getByRole('button', { name: 'Create invite link' }).click()
  const link = await a.getByRole('dialog').locator('p.font-mono').textContent()
  expect(link).toMatch(/\/join\/[A-Za-z0-9]{12}$/)
  const joinPath = new URL(link!).pathname
  await a.keyboard.press('Escape')

  // 3. Sam opens the link signed out, signs up, and lands back on the invite.
  await b.goto(joinPath)
  await expect(b).toHaveURL(/\/login\?next=/)
  await signUp(b, sam, joinPath)
  await expect(b.getByText(`${alex.name} invited you to`)).toBeVisible()
  await b.getByRole('button', { name: 'Join trip' }).click()
  await expect(b).toHaveURL(/\/itinerary/)

  // Alex sees Sam join live.
  await a.getByRole('link', { name: 'Members' }).click()
  await expect(a.getByText(sam.name)).toBeVisible()

  // 4. Alex adds a dinner with a cost split equally between both.
  await a.getByRole('link', { name: 'Itinerary' }).click()
  await a.getByRole('button', { name: 'Add plan' }).click()
  await a.getByPlaceholder('The Bund at night').fill('Dinner at Lost Heaven')
  await a.getByLabel('Starts').fill('19:30')
  await a.getByRole('switch', { name: 'This has a cost' }).click()
  await a.getByLabel('Amount', { exact: true }).fill('100')
  await a.getByRole('button', { name: 'Add to plan' }).click()
  await expect(a.getByText('Dinner at Lost Heaven')).toBeVisible()
  await expect(a.getByText('A$100.00').first()).toBeVisible()

  // Sam sees the plan appear live in their itinerary.
  await expect(b.getByText('Dinner at Lost Heaven')).toBeVisible()

  // 5. Sam marks their half as paid.
  await b.getByRole('link', { name: 'Expenses' }).click()
  await expect(b.getByText(`You owe ${alex.name}`)).toBeVisible()
  await b.getByText('Dinner at Lost Heaven').click()
  await b.getByRole('button', { name: 'I’ve paid' }).click()
  await b.getByRole('radio', { name: 'PayID' }).click()
  await b.getByLabel('Reference (optional)').fill('E2E-REF')
  await b.getByRole('button', { name: 'Mark as paid' }).click()
  await expect(b.getByText('Awaiting confirmation').first()).toBeVisible()

  // 6. Alex confirms from "Needs your confirmation".
  await a.getByRole('link', { name: 'Expenses' }).click()
  await expect(a.getByRole('heading', { name: 'Needs your confirmation' })).toBeVisible()
  await a.getByRole('button', { name: 'Confirm received' }).click()
  await expect(a.getByText('Everyone’s square. Nice.')).toBeVisible()

  // Sam's view updates to paid and the balance clears.
  await expect(b.getByText('Everyone’s square. Nice.')).toBeVisible()

  await ctxA.close()
  await ctxB.close()
})

test('signed-out deep link bounces through login and back', async ({ page }) => {
  await page.goto('/trips/some-trip/expenses')
  await expect(page).toHaveURL(/\/login\?next=%2Ftrips%2Fsome-trip%2Fexpenses/)
})
