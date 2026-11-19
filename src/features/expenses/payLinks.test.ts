import { describe, expect, it } from 'vitest'
import { hasPayTo, paypalLink, paypalUser } from './payLinks'

describe('pay links', () => {
  it('accepts the usual ways people write their PayPal.me name', () => {
    for (const raw of ['alex', '@alex', 'paypal.me/alex', 'https://www.paypal.me/alex/10', ' alex ']) expect(paypalUser(raw)).toBe('alex')
  })
  it('fills in the amount and currency', () => {
    expect(paypalLink('alex', 33727, 'AUD')).toBe('https://paypal.me/alex/337.27AUD')
    expect(paypalLink('alex', 4000, 'JPY')).toBe('https://paypal.me/alex/4000JPY')
    expect(paypalLink('not a name!', 100, 'AUD')).toBeNull()
  })
  it('knows when someone has added any details', () => {
    expect(hasPayTo(null)).toBe(false)
    expect(hasPayTo({ payId: '', paypalMe: '', bank: '' })).toBe(false)
    expect(hasPayTo({ payId: '0412', paypalMe: '', bank: '' })).toBe(true)
  })
})
