import { expect, test } from '@playwright/test'

/**
 * PWA checks against a production build (service workers are off in dev):
 *   npm run build && npx vite preview --port 4173
 *   E2E_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/pwa.spec.ts
 */
test.skip(!process.env.E2E_BASE_URL?.includes('4173'), 'needs a production preview build')

test('manifest is installable and the app shell works offline', async ({ page, context }) => {
  await page.goto('/login')
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBeTruthy()
  const manifest = await (await page.request.get(manifestHref!)).json()
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/', short_name: 'happs' })
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)

  // Service worker controls the page once activated.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  // Offline: navigations are served from the precached shell.
  await context.setOffline(true)
  await page.goto('/trips/anything/itinerary')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await context.setOffline(false)
})
