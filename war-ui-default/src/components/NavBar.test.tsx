// war-ui-default-spec.md §6, "NavBar" — the failure-path half of the
// Identity bullet the acceptance suite cannot honestly cover: "NavBar
// still renders full authenticated navigation — Home, My Wars, Create War,
// and logout all remain" even when GET /auth/me fails. NavBar has real
// branching (AuthenticatedNavLinks vs the anonymous link), so this is not
// the "component that only renders API data" case CLAUDE.md excludes from
// component testing.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NavBar } from './NavBar'
import { AuthProvider } from '../auth/context'
import { __resetAuthStateForTests, setToken } from '../api/authState'
import * as client from '../api/client'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return { ...actual, getMe: vi.fn() }
})

function renderNavBar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <NavBar />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('NavBar', () => {
  beforeEach(() => {
    setToken('test-token')
  })

  afterEach(() => {
    cleanup()
    __resetAuthStateForTests()
    vi.mocked(client.getMe).mockReset()
  })

  it('still renders Home, My Wars, Create War and Log out when GET /auth/me fails', async () => {
    // Arrange
    vi.mocked(client.getMe).mockRejectedValue(new Error('server error'))

    // Act
    renderNavBar()

    // Assert — the identity slot falls back, but navigation is unaffected.
    await waitFor(() => expect(screen.getByTestId('nav-identity')).toHaveTextContent('Voter'))
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My Wars' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create War' })).toBeInTheDocument()
    expect(screen.getByTestId('nav-logout')).toBeInTheDocument()
  })

  it('shows an avatar image beside the name when avatar_url is present', async () => {
    // Arrange
    vi.mocked(client.getMe).mockResolvedValue({
      voter: { id: 'voter-1', display_name: 'Jordan', avatar_url: 'https://cdn.example.test/a.png' },
    })

    // Act
    renderNavBar()

    // Assert
    await waitFor(() => expect(screen.getByTestId('nav-identity')).toHaveTextContent('Jordan'))
    const image = screen.getByTestId('nav-identity').querySelector('img')
    expect(image).toHaveAttribute('src', 'https://cdn.example.test/a.png')
    expect(image).toHaveAttribute('alt', '')
  })

  it('shows no avatar image when avatar_url is null', async () => {
    // Arrange
    vi.mocked(client.getMe).mockResolvedValue({
      voter: { id: 'voter-1', display_name: 'Jordan', avatar_url: null },
    })

    // Act
    renderNavBar()

    // Assert
    await waitFor(() => expect(screen.getByTestId('nav-identity')).toHaveTextContent('Jordan'))
    expect(screen.getByTestId('nav-identity').querySelector('img')).toBeNull()
  })
})
