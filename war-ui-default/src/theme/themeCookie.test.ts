import { afterEach, describe, expect, it } from 'vitest'
import { getThemePreference, setThemePreference } from './themeCookie'

function clearStoredPreferences(): void {
  document.cookie = 'war_theme_prefs=; path=/; max-age=0'
}

describe('themeCookie', () => {
  afterEach(() => {
    // Arrange for the next test — each test starts with no stored preference
    clearStoredPreferences()
  })

  it('returns null for a key with no stored preference', () => {
    // Arrange
    // (no cookie written)

    // Act
    const result = getThemePreference('war-1')

    // Assert
    expect(result).toBeNull()
  })

  it('returns the theme previously set for that key', () => {
    // Arrange
    setThemePreference('war-1', 'fight_card')

    // Act
    const result = getThemePreference('war-1')

    // Assert
    expect(result).toBe('fight_card')
  })

  it('keeps preferences for different keys independent', () => {
    // Arrange
    setThemePreference('war-1', 'fight_card')
    setThemePreference('home', 'scrapbook')

    // Act
    const warTheme = getThemePreference('war-1')
    const homeTheme = getThemePreference('home')

    // Assert
    expect(warTheme).toBe('fight_card')
    expect(homeTheme).toBe('scrapbook')
  })

  it('overwrites a previous preference for the same key', () => {
    // Arrange
    setThemePreference('war-1', 'fight_card')

    // Act
    setThemePreference('war-1', 'scrapbook')

    // Assert
    expect(getThemePreference('war-1')).toBe('scrapbook')
  })
})
