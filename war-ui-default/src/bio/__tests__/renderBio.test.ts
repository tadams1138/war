import { describe, expect, it } from 'vitest'
import { renderBio } from '../renderBio'

describe('renderBio', () => {
  it('returns an empty string for null', () => {
    // Arrange
    const input = null

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).toBe('')
  })

  it('returns an empty string for an empty string', () => {
    // Arrange
    const input = ''

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).toBe('')
  })

  it('renders **bold** as <strong>', () => {
    // Arrange
    const input = 'a **great** contestant'

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).toContain('<strong>great</strong>')
  })

  it('renders *italic* as <em>', () => {
    // Arrange
    const input = 'a *great* contestant'

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).toContain('<em>great</em>')
  })

  it('renders # heading as <h1>', () => {
    // Arrange
    const input = '# Reigning Champion'

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).toContain('<h1>Reigning Champion</h1>')
  })

  it('renders ## heading as <h2>', () => {
    // Arrange
    const input = '## Early Life'

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).toContain('<h2>Early Life</h2>')
  })

  it('renders ### heading as <h3>', () => {
    // Arrange
    const input = '### Trivia'

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).toContain('<h3>Trivia</h3>')
  })

  it('renders a markdown bullet list as <ul><li>', () => {
    // Arrange
    const input = '- Tall\n- Friendly'

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).toContain('<ul>')
    expect(result).toContain('<li>Tall</li>')
    expect(result).toContain('<li>Friendly</li>')
  })

  it('renders a markdown numbered list as <ol><li>', () => {
    // Arrange
    const input = '1. Tall\n2. Friendly'

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).toContain('<ol>')
    expect(result).toContain('<li>Tall</li>')
  })

  it('renders a markdown link as <a href>', () => {
    // Arrange
    const input = 'see [my website](https://example.test)'

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).toContain('<a href="https://example.test">my website</a>')
  })

  it('strips a <script> tag entirely rather than rendering or escaping it inert', () => {
    // Arrange
    const input = 'hello<script>alert(1)</script>world'

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).not.toContain('<script')
    expect(result).not.toContain('alert(1)')
  })

  it('strips an onerror handler embedded in raw HTML', () => {
    // Arrange
    const input = '<img src=x onerror="alert(1)">'

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).not.toContain('onerror')
    expect(result).not.toContain('<img')
  })

  it('strips a javascript: URI from a link', () => {
    // Arrange
    const input = '[click me](javascript:alert(1))'

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).not.toContain('javascript:')
  })

  it('drops tags outside the allow-list (e.g. a raw <table>) while keeping the text', () => {
    // Arrange
    const input = '<table><tr><td>x</td></tr></table>'

    // Act
    const result = renderBio(input)

    // Assert
    expect(result).not.toContain('<table')
    expect(result).toContain('x')
  })
})
