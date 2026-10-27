import { describe, expect, it, vi } from 'vitest'
import { createDebugLog, isDebugEnabled } from '../debugLog'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('isDebugEnabled', () => {
  it('is off without the debug flag', () => {
    // Arrange
    const storage = memoryStorage()

    // Act
    const enabled = isDebugEnabled('?foo=1', storage)

    // Assert
    expect(enabled).toBe(false)
  })

  it('is on with the debug flag and stays on for later pages in the tab', () => {
    // Arrange
    const storage = memoryStorage()

    // Act
    const first = isDebugEnabled('?debug', storage)
    const later = isDebugEnabled('', storage)

    // Assert
    expect(first).toBe(true)
    expect(later).toBe(true)
  })

  it('treats unavailable storage as no remembered flag', () => {
    // Arrange
    const storage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } as unknown as Storage

    // Act
    const withFlag = isDebugEnabled('?debug', storage)
    const withoutFlag = isDebugEnabled('', storage)

    // Assert
    expect(withFlag).toBe(true)
    expect(withoutFlag).toBe(false)
  })
})

describe('createDebugLog', () => {
  it('records entries with seconds since the log started and notifies listeners', () => {
    // Arrange
    let now = 1000
    const log = createDebugLog(() => now)
    const listener = vi.fn()
    log.subscribe(listener)

    // Act
    now = 3500
    log.add('left playVideo')

    // Assert
    expect(log.entries()).toEqual(['2.5s left playVideo'])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps only the most recent 200 entries', () => {
    // Arrange
    const log = createDebugLog(() => 0)

    // Act
    for (let index = 0; index < 205; index += 1) log.add(`event ${index}`)

    // Assert
    expect(log.entries()).toHaveLength(200)
    expect(log.entries()[0]).toBe('0.0s event 5')
  })

  it('stops notifying a listener once it unsubscribes', () => {
    // Arrange
    const log = createDebugLog(() => 0)
    const listener = vi.fn()
    const unsubscribe = log.subscribe(listener)

    // Act
    unsubscribe()
    log.add('ignored')

    // Assert
    expect(listener).not.toHaveBeenCalled()
  })
})
