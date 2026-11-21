/** A camera is available to the page (HTTPS, or localhost in dev). */
export function canScanQr(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia
}

type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> }

/**
 * Something that reads a QR code from a video frame: the browser's built-in
 * BarcodeDetector where it supports QR (Chrome on Android), otherwise jsQR,
 * loaded only when the scanner opens.
 */
export async function makeQrReader(): Promise<(video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector
  if (BD && (await BD.getSupportedFormats().catch((): string[] => [])).includes('qr_code')) {
    const detector = new BD({ formats: ['qr_code'] })
    return async (video) => (await detector.detect(video).catch(() => []))[0]?.rawValue ?? null
  }
  const { default: jsQR } = await import('jsqr')
  return async (video, canvas) => {
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return null
    // Scan a centred square, scaled down: plenty for a QR code and much faster.
    const side = Math.min(w, h)
    const size = Math.min(640, side)
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size)
    const img = ctx.getImageData(0, 0, size, size)
    return jsQR(img.data, size, size, { inversionAttempts: 'dontInvert' })?.data ?? null
  }
}
