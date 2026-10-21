// The role gate's decision: who is redirected Home. The acceptance suite
// covers a plain Voter; this covers the rule that Admin and Moderator are
// orthogonal.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireRole } from '../RequireRole'
import { AuthProvider } from '../../auth/context'
import { canAssignRoles, canModerate } from '../../auth/roles'
import { __resetAuthStateForTests, setToken } from '../../api/authState'
import * as client from '../../api/client'

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>()
  return { ...actual, getMe: vi.fn() }
})

function renderGuarded(allow: typeof canModerate) {
  return render(
    <MemoryRouter initialEntries={['/guarded']}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<p>Home</p>} />
          <Route
            path="/guarded"
            element={
              <RequireRole allow={allow}>
                <p>Guarded</p>
              </RequireRole>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function signInWith(flags: { is_moderator: boolean; is_admin: boolean }) {
  vi.mocked(client.getMe).mockResolvedValue({ voter: { id: 'v', display_name: null, avatar_url: null, ...flags } })
}

describe('RequireRole', () => {
  beforeEach(() => {
    setToken('test-token')
  })

  afterEach(() => {
    cleanup()
    __resetAuthStateForTests()
    vi.mocked(client.getMe).mockReset()
  })

  it.each([
    ['an Admin who is not a Moderator', { is_moderator: false, is_admin: true }, canModerate, 'Home'],
    ['a Moderator who is not an Admin', { is_moderator: true, is_admin: false }, canAssignRoles, 'Home'],
    ['a Moderator', { is_moderator: true, is_admin: false }, canModerate, 'Guarded'],
    ['an Admin', { is_moderator: false, is_admin: true }, canAssignRoles, 'Guarded'],
  ])('for %s the gate shows: %s', async (_who, flags, allow, expected) => {
    // Arrange
    signInWith(flags)

    // Act
    renderGuarded(allow)

    // Assert
    expect(await screen.findByText(expected)).toBeInTheDocument()
  })
})
