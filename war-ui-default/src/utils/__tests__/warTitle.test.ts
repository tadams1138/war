import { describe, expect, it } from 'vitest'
import { warTitle } from '../warTitle'

describe('warTitle', () => {
  it('returns a real title unchanged', () => {
    // Arrange
    const title = 'Best Pizza in Town'

    // Act
    const result = warTitle(title)

    // Assert
    expect(result).toBe('Best Pizza in Town')
  })

  it('falls back to a placeholder for a null title', () => {
    // Arrange
    const title = null

    // Act
    const result = warTitle(title)

    // Assert
    expect(result).toBe('Untitled War')
  })

  it('falls back to a placeholder for an empty title', () => {
    // Arrange
    const title = ''

    // Act
    const result = warTitle(title)

    // Assert
    expect(result).toBe('Untitled War')
  })
})
