import { useEffect, useState } from 'react'
import { Share, SquarePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isStandalone } from '@/features/auth/authApi'
import { isIOS } from '@/lib/openApp'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'happs.installDismissed'
let deferred: BeforeInstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
  })
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Dismissible "Add happs to your home screen" card. Chrome/Android get the
 * native prompt; iOS has no install event, so we show Share → Add to Home Screen.
 */
export function InstallPrompt() {
  const [canPrompt, setCanPrompt] = useState(!!deferred)
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    const onPrompt = () => setTimeout(() => setCanPrompt(!!deferred), 0)
    const onInstalled = () => setDismissed(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const ios = isIOS()
  if (dismissed || isStandalone() || (!canPrompt && !ios)) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* storage unavailable */
    }
  }

  return (
    <aside className="relative flex gap-3 rounded-[1.25rem] bg-card p-4 pr-12 ring-1 ring-border/70" aria-label="Install happs">
      <img src="/pwa-64x64.png" alt="" className="size-11 rounded-xl" />
      <div className="space-y-2">
        <p className="font-semibold">Add happs to your home screen</p>
        {ios ? (
          <p className="text-sm text-muted-foreground">
            Tap <Share className="inline size-4 align-text-bottom" aria-label="Share" /> in Safari, then{' '}
            <span className="font-medium text-foreground">
              Add to Home Screen <SquarePlus className="inline size-4 align-text-bottom" aria-hidden />
            </span>
            . It opens full screen and works offline.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Opens full screen, works offline, and can notify you about payments.</p>
            <Button
              size="sm"
              onClick={async () => {
                await deferred?.prompt()
                const choice = await deferred?.userChoice
                deferred = null
                setCanPrompt(false)
                if (choice?.outcome === 'accepted') dismiss()
              }}
            >
              Install app
            </Button>
          </>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-full hover:bg-foreground/6">
        <X className="size-4" />
      </button>
    </aside>
  )
}
