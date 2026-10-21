// Which actions a Voter's detail offers each viewer (war-spec.md §3, §6.7):
// Suspend and Ban only to a Moderator, never against a role holder or oneself;
// role controls only to an Admin. Admin and Moderator are orthogonal, so the
// Admin-without-Moderator case is covered here rather than by a scenario.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { VoterActions } from '../VoterActions'

const PLAIN = { id: 'v-2', display_name: 'Pat', avatar_url: null, created_at: '2026-10-01T00:00:00Z', suspended: false, banned: false, is_moderator: false, is_admin: false, war_count: 0, wars: [] }
const viewer = (flags: { is_moderator: boolean; is_admin: boolean }, id = 'v-1') => ({ id, display_name: 'Me', avatar_url: null, ...flags })

const offered = () => screen.queryAllByRole('button').map((button) => button.textContent)

function renderActions(viewerFlags: { is_moderator: boolean; is_admin: boolean }, voter: Partial<typeof PLAIN> = {}, viewerId = 'v-1') {
  return render(<VoterActions voter={{ ...PLAIN, ...voter }} viewer={viewer(viewerFlags, viewerId)} onChanged={() => undefined} />)
}

describe('VoterActions', () => {
  afterEach(cleanup)

  it.each([
    ['a Moderator', { is_moderator: true, is_admin: false }, ['Suspend', 'Ban']],
    ['an Admin', { is_moderator: false, is_admin: true }, ['Grant Moderator', 'Grant Admin']],
    ['an Admin and Moderator', { is_moderator: true, is_admin: true }, ['Suspend', 'Ban', 'Grant Moderator', 'Grant Admin']],
  ])('offers %s, viewing a plain Voter, exactly: %j', (_who, flags, expected) => {
    // Arrange / Act
    renderActions(flags)

    // Assert
    expect(offered()).toEqual(expected)
  })

  it('offers an Admin who is not a Moderator no sanction note against a role holder', () => {
    // Arrange / Act
    renderActions({ is_moderator: false, is_admin: true }, { is_moderator: true })

    // Assert
    expect(offered()).toEqual(['Revoke Moderator', 'Grant Admin'])
    expect(screen.queryByTestId('voter-sanction-note')).toBeNull()
  })

  it('offers an Admin who is not a Moderator no revoke-own-Admin control on their own detail', () => {
    // Arrange / Act
    renderActions({ is_moderator: false, is_admin: true }, { id: 'v-1', is_admin: true }, 'v-1')

    // Assert
    expect(offered()).toEqual(['Grant Moderator'])
  })
})
