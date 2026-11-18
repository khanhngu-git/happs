/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Custom service worker so Workbox precaching and FCM background messages
      // share a single registration (two SWs on the same scope would fight).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      devOptions: { enabled: false, type: 'module' },
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png', 'favicon.ico'],
      manifest: {
        name: 'happs: group trip planner',
        short_name: 'happs',
        description: 'Plan group trips, split costs and confirm payments together.',
        theme_color: '#0d9488',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  server: {
    // Same-origin Firebase Auth in dev (VITE_AUTH_SAME_ORIGIN=true, real project):
    // the auth handler is proxied so redirect sign-in isn't cross-site.
    proxy: env.VITE_FIREBASE_AUTH_DOMAIN
      ? {
          '/__/auth': { target: `https://${env.VITE_FIREBASE_AUTH_DOMAIN}`, changeOrigin: true },
          '/__/firebase': { target: `https://${env.VITE_FIREBASE_AUTH_DOMAIN}`, changeOrigin: true },
        }
      : undefined,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}
})
