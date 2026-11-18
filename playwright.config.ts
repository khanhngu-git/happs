import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests always run against their own emulator suite
 * (`npm run test:e2e` → firebase.e2e.json, ports 1xxxx) and their own dev
 * server on :5174 with the Auth emulator forced on. They can never create
 * accounts in the real Firebase project, and they don't disturb your dev
 * emulators or dev server.
 */
const PORT = 5174
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // One shared emulator suite: run files one at a time so they don't contend.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    ...devices['Pixel 7'],
  },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx vite --port ${PORT} --strictPort --host localhost`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 60_000,
        env: {
          VITE_USE_EMULATORS: 'true',
          VITE_AUTH_EMULATOR: 'true',
          VITE_AUTH_SAME_ORIGIN: '',
          VITE_EMU_AUTH_PORT: '19099',
          VITE_EMU_FIRESTORE_PORT: '18080',
          VITE_EMU_FUNCTIONS_PORT: '15001',
          VITE_EMU_STORAGE_PORT: '19199',
        },
      },
})
