import { describe, expect, it } from 'vitest'
import { isSafeHttpUrl } from '../url'

describe('isSafeHttpUrl', () => {
  it('accepts an http URL', () => {
    // Arrange / Act / Assert
    expect(isSafeHttpUrl('http://example.com')).toBe(true)
  })

  it('accepts an https URL', () => {
    // Arrange / Act / Assert
    expect(isSafeHttpUrl('https://example.com/path?q=1')).toBe(true)
  })

  it('rejects a javascript: URL', () => {
    // Arrange / Act / Assert
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects a value that is not a URL at all', () => {
    // Arrange / Act / Assert
    expect(isSafeHttpUrl('not a url')).toBe(false)
  })
})
