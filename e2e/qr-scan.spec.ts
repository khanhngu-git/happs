import { expect, test, type Page } from '@playwright/test'
import QRCode from 'qrcode'
import { signUp, testUser } from './helpers'

/** Replace the camera with a canvas showing this image, so the scanner sees a real QR code. */
async function fakeCamera(page: Page, imageDataUrl: string) {
  await page.addInitScript((src) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const img = new Image()
      img.src = src
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 480
      const ctx = canvas.getContext('2d')!
      const draw = () => {
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, 640, 480)
        ctx.drawImage(img, 170, 90, 300, 300)
      }
      draw()
      setInterval(draw, 100)
      return canvas.captureStream(10)
    }
  }, imageDataUrl)
}

test('scan an invite QR code to open the join page', async ({ page, baseURL }) => {
  await fakeCamera(page, await QRCode.toDataURL(`${baseURL}/join/AbCdEfGhJk12`, { margin: 2, width: 300 }))
  await signUp(page, testUser('Scanner'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Join a trip' }).click()
  await page.getByRole('button', { name: 'Scan QR code' }).click()
  await expect(page).toHaveURL(/\/join\/AbCdEfGhJk12$/, { timeout: 30_000 })
})

test('a QR code that isn’t an invite says so', async ({ page }) => {
  await fakeCamera(page, await QRCode.toDataURL('https://example.com/menu', { margin: 2, width: 300 }))
  await signUp(page, testUser('Scanner2'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Join a trip' }).click()
  await page.getByRole('button', { name: 'Scan QR code' }).click()
  await expect(page.getByText('That QR code isn’t a happs invite.')).toBeVisible({ timeout: 30_000 })
})
