import type { MouseEvent } from 'react'
import { isIOS, openApp } from '@/lib/openApp'
import type { Location } from '@/shared/schemas'
import { amapIosUrl, amapUrl } from './routes'

/** On iPhone, open the Amap app directly (the web link can't), falling back to the web page. */
export function openAmapOnIOS(e: MouseEvent, to: Location, from?: Location | null) {
  if (!isIOS()) return
  e.preventDefault()
  openApp(amapIosUrl(to, from), amapUrl(to, from))
}
