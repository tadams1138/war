import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useTheme } from './useTheme'

function clearStoredPreferences(): void {
  document.cookie = 'war_theme_prefs=; path=/; max-age=0'
}

describe('useTheme', () => {
  afterEach(() => {
    clearStoredPreferences()
  })

  it('returns the fallback when the voter has no stored preference for this key', () => {
    // Arrange
    const { result } = renderHook(() => useTheme('war-1', 'arcade'))

    // Act
    const [theme] = result.current

    // Assert
    expect(theme).toBe('arcade')
  })

  it('returns whatever fallback it is given, not a hardcoded default', () => {
    // Arrange
    const { result } = renderHook(() => useTheme('war-1', 'fight_card'))

    // Act
    const [theme] = result.current

    // Assert
    expect(theme).toBe('fight_card')
  })

  it('switches to the chosen theme and keeps it across re-renders', () => {
    // Arrange
    const { result } = renderHook(() => useTheme('war-1', 'arcade'))

    // Act
    act(() => {
      const [, choose] = result.current
      choose('scrapbook')
    })

    // Assert
    expect(result.current[0]).toBe('scrapbook')
  })

  it('keeps one key\'s choice from leaking into another key', () => {
    // Arrange
    const warHook = renderHook(() => useTheme('war-1', 'arcade'))
    act(() => {
      warHook.result.current[1]('fight_card')
    })

    // Act
    const homeHook = renderHook(() => useTheme('home', 'arcade'))

    // Assert
    expect(homeHook.result.current[0]).toBe('arcade')
  })
})
