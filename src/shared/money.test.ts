import { describe, expect, it } from 'vitest'
import { convertMinor, currencyDigits, formatMoney, minorToDecimalString, parseToMinor, sumMinor } from './money'

describe('currencyDigits', () => {
  it('knows zero-decimal currencies', () => {
    expect(currencyDigits('USD')).toBe(2)
    expect(currencyDigits('JPY')).toBe(0)
    expect(currencyDigits('KRW')).toBe(0)
    expect(currencyDigits('aud')).toBe(2)
  })
})

describe('parseToMinor', () => {
  it('parses decimals without float error', () => {
    expect(parseToMinor('0.1', 'USD')).toBe(10)
    expect(parseToMinor('0.29', 'USD')).toBe(29) // 0.29 * 100 = 28.999999999999996 in floats
    expect(parseToMinor('1,234.56', 'AUD')).toBe(123456)
    expect(parseToMinor('12', 'AUD')).toBe(1200)
    expect(parseToMinor('.5', 'AUD')).toBe(50)
    expect(parseToMinor('1000', 'JPY')).toBe(1000)
  })
  it('rejects invalid input and excess precision', () => {
    expect(parseToMinor('', 'USD')).toBeNull()
    expect(parseToMinor('abc', 'USD')).toBeNull()
    expect(parseToMinor('1.234', 'USD')).toBeNull()
    expect(parseToMinor('1.5', 'JPY')).toBeNull()
    expect(parseToMinor('1.2.3', 'USD')).toBeNull()
  })
})

describe('formatting', () => {
  it('round-trips minor units to decimal strings', () => {
    expect(minorToDecimalString(5, 2)).toBe('0.05')
    expect(minorToDecimalString(-12345, 2)).toBe('-123.45')
    expect(minorToDecimalString(1000, 0)).toBe('1000')
  })
  it('formats with currency', () => {
    expect(formatMoney(3334, 'USD', 'en-US')).toBe('$33.34')
    expect(formatMoney(1500, 'JPY', 'en-US')).toBe('¥1,500')
  })
})

describe('convertMinor', () => {
  it('is identity for same currency', () => {
    expect(convertMinor(1234, 'AUD', 'AUD', 99)).toBe(1234)
  })
  it('converts and rounds to integers', () => {
    // 100.00 CNY at 0.2135 AUD/CNY = 21.35 AUD
    expect(convertMinor(10000, 'CNY', 'AUD', 0.2135)).toBe(2135)
    // half rounds away from zero
    expect(convertMinor(1, 'USD', 'AUD', 1.5)).toBe(2)
  })
  it('handles different minor digits', () => {
    // 1000 JPY at 0.0102 AUD/JPY = 10.20 AUD
    expect(convertMinor(1000, 'JPY', 'AUD', 0.0102)).toBe(1020)
    // 10.00 AUD at 98.04 JPY/AUD = 980 JPY
    expect(convertMinor(1000, 'AUD', 'JPY', 98.04)).toBe(980)
  })
  it('rejects bad rates and non-integers', () => {
    expect(() => convertMinor(100, 'USD', 'AUD', 0)).toThrow()
    expect(() => convertMinor(1.5, 'USD', 'AUD', 1)).toThrow()
  })
  it('sums integers only', () => {
    expect(sumMinor([1, 2, 3])).toBe(6)
    expect(() => sumMinor([0.1])).toThrow()
  })
})
