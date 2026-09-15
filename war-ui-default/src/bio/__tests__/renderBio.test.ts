import { describe, expect, it } from 'vitest'
import { renderBio } from '../renderBio'

describe('renderBio', () => {
  it('returns an empty string for null', () => {
    // Arrange / Act
    const result = renderBio(null)

    // Assert
    expect(result).toBe('')
  })

  it('returns an empty string for an empty string', () => {
    // Arrange / Act
    const result = renderBio('')

    // Assert
    expect(result).toBe('')
  })

  it('renders **bold** as <strong>', () => {
    // Arrange / Act
    const result = renderBio('a **great** contestant')

    // Assert
    expect(result).toContain('<strong>great</strong>')
  })

  it('renders *italic* as <em>', () => {
    // Arrange / Act
    const result = renderBio('a *great* contestant')

    // Assert
    expect(result).toContain('<em>great</em>')
  })

  it('renders # heading as <h1>', () => {
    // Arrange / Act
    const result = renderBio('# Reigning Champion')

    // Assert
    expect(result).toContain('<h1>Reigning Champion</h1>')
  })

  it('renders ## heading as <h2>', () => {
    // Arrange / Act
    const result = renderBio('## Early Life')

    // Assert
    expect(result).toContain('<h2>Early Life</h2>')
  })

  it('renders ### heading as <h3>', () => {
    // Arrange / Act
    const result = renderBio('### Trivia')

    // Assert
    expect(result).toContain('<h3>Trivia</h3>')
  })

  it('renders a markdown bullet list as <ul><li>', () => {
    // Arrange / Act
    const result = renderBio('- Tall\n- Friendly')

    // Assert
    expect(result).toContain('<ul>')
    expect(result).toContain('<li>Tall</li>')
    expect(result).toContain('<li>Friendly</li>')
  })

  it('renders a markdown numbered list as <ol><li>', () => {
    // Arrange / Act
    const result = renderBio('1. Tall\n2. Friendly')

    // Assert
    expect(result).toContain('<ol>')
    expect(result).toContain('<li>Tall</li>')
  })

  it('renders a markdown link as <a href>', () => {
    // Arrange / Act
    const result = renderBio('see [my website](https://example.test)')

    // Assert
    expect(result).toContain('<a href="https://example.test">my website</a>')
  })

  it('strips a <script> tag entirely rather than rendering or escaping it inert', () => {
    // Arrange / Act
    const result = renderBio('hello<script>alert(1)</script>world')

    // Assert
    expect(result).not.toContain('<script')
    expect(result).not.toContain('alert(1)')
  })

  it('strips an onerror handler embedded in raw HTML', () => {
    // Arrange / Act
    const result = renderBio('<img src=x onerror="alert(1)">')

    // Assert
    expect(result).not.toContain('onerror')
    expect(result).not.toContain('<img')
  })

  it('strips a javascript: URI from a link', () => {
    // Arrange / Act
    const result = renderBio('[click me](javascript:alert(1))')

    // Assert
    expect(result).not.toContain('javascript:')
  })

  it('drops tags outside the allow-list (e.g. a raw <table>) while keeping the text', () => {
    // Arrange / Act
    const result = renderBio('<table><tr><td>x</td></tr></table>')

    // Assert
    expect(result).not.toContain('<table')
    expect(result).toContain('x')
  })
})
