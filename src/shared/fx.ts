/**
 * Optional FX prefill from the free Frankfurter API (ECB reference rates).
 * The rate is always user editable and is captured on the expense at entry
 * time, so later rate changes never alter recorded balances.
 */
export async function fetchFxRate(from: string, to: string, signal?: AbortSignal): Promise<number | null> {
  if (from.toUpperCase() === to.toUpperCase()) return 1
  try {
    const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const json = (await res.json()) as { rates?: Record<string, number> }
    const rate = json.rates?.[to.toUpperCase()]
    return typeof rate === 'number' && rate > 0 ? rate : null
  } catch {
    return null
  }
}
