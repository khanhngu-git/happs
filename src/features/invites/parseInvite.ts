/**
 * Accepts whatever someone pastes: a full invite link
 * (https://happss.web.app/join/AbC123xYz789), a link with extra text around
 * it, or just the code. Returns the code, or null if there isn't one.
 */
export function parseInviteCode(input: string): string | null {
  const text = input.trim()
  const fromLink = /\/join\/([A-Za-z0-9]{10,64})/.exec(text)
  if (fromLink) return fromLink[1]!
  if (/^[A-Za-z0-9]{10,64}$/.test(text)) return text
  return null
}
