import { expect, type Page } from '@playwright/test'

/** Test accounts are unique per run so the suite can repeat against the same emulator. */
export const runId = Date.now().toString(36)
export const TEST_PASSWORD = 'e2e-pass-1234'
export const testUser = (name: string) => ({ name: `${name} E2E`, email: `${name.toLowerCase()}-${runId}@example.test`, password: TEST_PASSWORD })

export async function signUp(page: Page, u: { name: string; email: string; password: string }, next?: string) {
  await page.goto(next ? `/signup?next=${encodeURIComponent(next)}` : '/signup')
  await page.getByLabel('Your name').fill(u.name)
  await page.getByLabel('Email').fill(u.email)
  await page.getByLabel('Password').fill(u.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText(/Account created/)).toBeVisible()
}
