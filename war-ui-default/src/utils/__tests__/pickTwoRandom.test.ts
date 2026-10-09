import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickTwoRandom } from '../pickTwoRandom'

function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('pickTwoRandom', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns two distinct items from the input', () => {
    // Arrange
    const items = ['a', 'b', 'c', 'd']

    // Act
    const [first, second] = pickTwoRandom(items)

    // Assert
    expect(first).not.toBe(second)
    expect(items).toContain(first)
    expect(items).toContain(second)
  })

  it('does not mutate the input', () => {
    // Arrange
    const items = ['a', 'b', 'c']

    // Act
    pickTwoRandom(items)

    // Assert
    expect(items).toEqual(['a', 'b', 'c'])
  })

  it('picks every ordered pair about equally often', () => {
    // Arrange
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(42))
    const counts = new Map<string, number>()
    const draws = 6000

    // Act
    for (let i = 0; i < draws; i++) {
      const key = pickTwoRandom(['a', 'b', 'c']).join('')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    // Assert -- 6 ordered pairs, expected 1000 each
    expect(counts.size).toBe(6)
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(850)
      expect(count).toBeLessThan(1150)
    }
  })
})
