// Which panels the Admin Dashboard shows each role (war-spec.md §10.1): a
// Moderator the moderation panels, an Admin the role-management ones, both
// everything. Admin and Moderator are orthogonal, so the Admin-without-Moderator
// case is covered here rather than by a scenario.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminDashboard } from '../AdminDashboard'
import { ThemeProvider } from '../../theme/ThemeContext'

const flags = vi.hoisted(() => ({ current: { is_moderator: false, is_admin: false } }))

vi.mock('../../auth/context', () => ({
  useAuth: () => ({ me: { status: 'loaded', value: { voter: { id: 'v', display_name: null, avatar_url: null, ...flags.current } } } }),
}))
vi.mock('../../admin/KillSwitchPanel', () => ({ KillSwitchPanel: () => <p>Kill switch panel</p> }))
vi.mock('../../admin/wars/UnaddressedQueuePanel', () => ({ UnaddressedQueuePanel: () => <p>Unaddressed queue panel</p> }))
vi.mock('../../admin/wars/AdminWarsPanel', () => ({ AdminWarsPanel: () => <p>Wars panel</p> }))
vi.mock('../../admin/voters/AdminVotersPanel', () => ({ AdminVotersPanel: () => <p>Voters panel</p> }))
vi.mock('../../admin/ModerationLogPanel', () => ({ ModerationLogPanel: () => <p>Moderation log panel</p> }))

const MODERATION = ['Kill switch panel', 'Unaddressed queue panel', 'Wars panel']
const SHARED = ['Voters panel', 'Moderation log panel']

describe('AdminDashboard', () => {
  afterEach(cleanup)

  it.each([
    ['a Moderator', { is_moderator: true, is_admin: false }],
    ['an Admin', { is_moderator: false, is_admin: true }],
    ['an Admin and Moderator', { is_moderator: true, is_admin: true }],
  ])('shows %s only the panels of their roles', (_who, roleFlags) => {
    // Arrange
    flags.current = roleFlags

    // Act
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AdminDashboard />
        </ThemeProvider>
      </MemoryRouter>,
    )

    // Assert
    const shown = screen.getAllByText(/ panel$/).map((panel) => panel.textContent)
    expect(shown).toEqual(roleFlags.is_moderator ? [...MODERATION, ...SHARED] : SHARED)
  })
})
