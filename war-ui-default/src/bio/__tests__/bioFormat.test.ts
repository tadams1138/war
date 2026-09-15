import { describe, expect, it } from 'vitest'
import { applyBioFormat } from '../bioFormat'

describe('applyBioFormat', () => {
  describe('bold', () => {
    it('wraps the selected text in ** markers and selects the wrapped text, not the markers', () => {
      // Arrange
      const text = 'a great contestant'
      const selection = { start: 2, end: 7 } // "great"

      // Act
      const result = applyBioFormat(text, selection, 'bold')

      // Assert
      expect(result.text).toBe('a **great** contestant')
      expect(result.text.slice(result.selection.start, result.selection.end)).toBe('great')
    })

    it('inserts placeholder text and selects it when nothing is selected', () => {
      // Arrange
      const text = ''
      const selection = { start: 0, end: 0 }

      // Act
      const result = applyBioFormat(text, selection, 'bold')

      // Assert
      expect(result.text).toBe('**bold text**')
      expect(result.text.slice(result.selection.start, result.selection.end)).toBe('bold text')
    })
  })

  describe('italic', () => {
    it('wraps the selected text in single * markers', () => {
      // Arrange
      const text = 'a great contestant'
      const selection = { start: 2, end: 7 }

      // Act
      const result = applyBioFormat(text, selection, 'italic')

      // Assert
      expect(result.text).toBe('a *great* contestant')
      expect(result.text.slice(result.selection.start, result.selection.end)).toBe('great')
    })
  })

  describe('link', () => {
    it('wraps the selected text as link text and selects the url placeholder', () => {
      // Arrange
      const text = 'see my website'
      const selection = { start: 4, end: 14 } // "my website"

      // Act
      const result = applyBioFormat(text, selection, 'link')

      // Assert
      expect(result.text).toBe('see [my website](url)')
      expect(result.text.slice(result.selection.start, result.selection.end)).toBe('url')
    })

    it('inserts placeholder link text and a url placeholder when nothing is selected', () => {
      // Arrange
      const text = ''
      const selection = { start: 0, end: 0 }

      // Act
      const result = applyBioFormat(text, selection, 'link')

      // Assert
      expect(result.text).toBe('[link text](url)')
      expect(result.text.slice(result.selection.start, result.selection.end)).toBe('url')
    })
  })

  describe('heading1/heading2/heading3', () => {
    it('prefixes a selected line with "# " for heading1', () => {
      // Arrange
      const text = 'Miss Congeniality'
      const selection = { start: 0, end: text.length }

      // Act
      const result = applyBioFormat(text, selection, 'heading1')

      // Assert
      expect(result.text).toBe('# Miss Congeniality')
    })

    it('prefixes a selected line with "## " for heading2', () => {
      // Arrange
      const text = 'Bio'
      const selection = { start: 0, end: text.length }

      // Act
      const result = applyBioFormat(text, selection, 'heading2')

      // Assert
      expect(result.text).toBe('## Bio')
    })

    it('prefixes a selected line with "### " for heading3', () => {
      // Arrange
      const text = 'Bio'
      const selection = { start: 0, end: text.length }

      // Act
      const result = applyBioFormat(text, selection, 'heading3')

      // Assert
      expect(result.text).toBe('### Bio')
    })
  })

  describe('bulletList', () => {
    it('prefixes a single selected line with "- "', () => {
      // Arrange
      const text = 'Miss Congeniality'
      const selection = { start: 0, end: text.length }

      // Act
      const result = applyBioFormat(text, selection, 'bulletList')

      // Assert
      expect(result.text).toBe('- Miss Congeniality')
    })

    it('prefixes every selected line', () => {
      // Arrange
      const text = 'Tall\nFriendly\nCompetitive'
      const selection = { start: 0, end: text.length }

      // Act
      const result = applyBioFormat(text, selection, 'bulletList')

      // Assert
      expect(result.text).toBe('- Tall\n- Friendly\n- Competitive')
    })

    it('inserts an empty bullet at the cursor when nothing is selected, cursor after the marker', () => {
      // Arrange
      const text = ''
      const selection = { start: 0, end: 0 }

      // Act
      const result = applyBioFormat(text, selection, 'bulletList')

      // Assert
      expect(result.text).toBe('- ')
      expect(result.selection).toEqual({ start: 2, end: 2 })
    })
  })

  describe('numberedList', () => {
    it('prefixes each selected line with an incrementing number', () => {
      // Arrange
      const text = 'Tall\nFriendly\nCompetitive'
      const selection = { start: 0, end: text.length }

      // Act
      const result = applyBioFormat(text, selection, 'numberedList')

      // Assert
      expect(result.text).toBe('1. Tall\n2. Friendly\n3. Competitive')
    })
  })

  describe('preserves text outside the selection', () => {
    it('keeps text before and after the selection untouched', () => {
      // Arrange
      const text = 'Reigning champion of three pageants'
      const start = text.indexOf('champion')
      const selection = { start, end: start + 'champion'.length }

      // Act
      const result = applyBioFormat(text, selection, 'bold')

      // Assert
      expect(result.text).toBe('Reigning **champion** of three pageants')
    })
  })
})
