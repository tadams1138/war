import { describe, expect, it } from 'vitest'
import { buildMediaItem } from '../../mocks/fixtures'
import { byDisplayOrder, primaryMedia, srcSetFor } from '../media'

describe('byDisplayOrder', () => {
  it('sorts media by display_order regardless of array order', () => {
    // Arrange — shuffled: display_order 2, 0, 1
    const second = buildMediaItem({ id: 'second', display_order: 2 })
    const first = buildMediaItem({ id: 'first', display_order: 0 })
    const middle = buildMediaItem({ id: 'middle', display_order: 1 })

    // Act
    const sorted = byDisplayOrder([second, first, middle])

    // Assert
    expect(sorted.map((item) => item.id)).toEqual(['first', 'middle', 'second'])
  })

  it('does not mutate the array it was given', () => {
    // Arrange
    const second = buildMediaItem({ id: 'second', display_order: 2 })
    const first = buildMediaItem({ id: 'first', display_order: 0 })
    const original = [second, first]

    // Act
    byDisplayOrder(original)

    // Assert
    expect(original.map((item) => item.id)).toEqual(['second', 'first'])
  })
})

describe('primaryMedia', () => {
  it('returns the display_order 0 item even when it is not first in the array', () => {
    // Arrange — shuffled, primary is last in array order
    const second = buildMediaItem({ id: 'second', display_order: 2 })
    const first = buildMediaItem({ id: 'first', display_order: 0 })
    const middle = buildMediaItem({ id: 'middle', display_order: 1 })

    // Act
    const primary = primaryMedia([second, middle, first])

    // Assert
    expect(primary?.id).toBe('first')
  })

  it('returns undefined for an empty media array', () => {
    // Arrange / Act
    const primary = primaryMedia([])

    // Assert
    expect(primary).toBeUndefined()
  })
})

describe('srcSetFor', () => {
  it('builds a srcset string from the variants array', () => {
    // Arrange
    const item = buildMediaItem({
      id: 'x',
      variants: [
        { width: 400, url: 'https://cdn.example.test/x/400.jpg' },
        { width: 1600, url: 'https://cdn.example.test/x/1600.jpg' },
      ],
    })

    // Act
    const srcSet = srcSetFor(item)

    // Assert
    expect(srcSet).toBe('https://cdn.example.test/x/400.jpg 400w, https://cdn.example.test/x/1600.jpg 1600w')
  })
})
