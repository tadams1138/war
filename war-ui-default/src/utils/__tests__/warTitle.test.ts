import { describe, expect, it } from 'vitest'
import { warTitle } from '../warTitle'

describe('warTitle', () => {
  it('returns a real title unchanged', () => {
    // Arrange / Act / Assert
    expect(warTitle('Best Pizza in Town')).toBe('Best Pizza in Town')
  })

  it('falls back to a placeholder for a null title', () => {
    // Arrange / Act / Assert
    expect(warTitle(null)).toBe('Untitled War')
  })

  it('falls back to a placeholder for an empty title', () => {
    // Arrange / Act / Assert
    expect(warTitle('')).toBe('Untitled War')
  })
})
