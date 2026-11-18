import { describe, expect, it } from 'vitest'
import { parseInviteCode } from './parseInvite'

describe('parseInviteCode', () => {
  it('reads codes from links, pasted messages and bare codes', () => {
    expect(parseInviteCode('https://happss.web.app/join/5JNGp5PB7uFa')).toBe('5JNGp5PB7uFa')
    expect(parseInviteCode('Join “Shanghai” on happs http://localhost:5173/join/5JNGp5PB7uFa ')).toBe('5JNGp5PB7uFa')
    expect(parseInviteCode('  5JNGp5PB7uFa ')).toBe('5JNGp5PB7uFa')
  })
  it('rejects things that are not invites', () => {
    expect(parseInviteCode('')).toBeNull()
    expect(parseInviteCode('hello')).toBeNull()
    expect(parseInviteCode('https://example.com/trips/abc')).toBeNull()
  })
})
