import { expect, test } from '@playwright/test'

/** Google sign-in through the Auth emulator's provider widget (popup or redirect). */
for (const device of ['desktop', 'mobile'] as const) {
  test(`Google sign-in works on ${device}`, async ({ browser }) => {
    const ctx = await browser.newContext(
      device === 'desktop' ? { viewport: { width: 1280, height: 800 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36' } : {},
    )
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/login')
    const popupPromise = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null)
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    const popup = await popupPromise
    const widget = popup ?? page
    await widget.getByText('Add new account').click({ timeout: 10_000 })
    await widget.getByText('Auto-generate user information').click()
    await widget.getByRole('button', { name: /Sign in with Google/i }).click()
    await expect(page.getByRole('heading', { name: 'Trips', exact: true })).toBeVisible({ timeout: 15_000 })
    expect(errors).toEqual([])
    await ctx.close()
  })
}
