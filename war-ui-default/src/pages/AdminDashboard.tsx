// The Admin Dashboard (war-spec.md §10.1 routes table; §6.7): each role sees its
// own panels. A Moderator has the Wars, the unaddressed reports queue and the
// kill switch; a Moderator and an Admin both have the Voters list and the
// moderation log (the API gives each the entries of its own role).
import { useState } from 'react'
import { canModerate } from '../auth/roles'
import { useViewer } from '../auth/useViewer'
import { KillSwitchPanel } from '../admin/KillSwitchPanel'
import { ModerationLogPanel } from '../admin/ModerationLogPanel'
import { AdminVotersPanel } from '../admin/voters/AdminVotersPanel'
import { AdminWarsPanel } from '../admin/wars/AdminWarsPanel'
import { UnaddressedQueuePanel } from '../admin/wars/UnaddressedQueuePanel'
import { FALLBACK_THEME, usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'

export function AdminDashboard() {
  const [theme, setTheme] = useTheme('home', FALLBACK_THEME)
  usePublishTheme('home', theme, setTheme)
  // Bumped whenever a panel takes a moderation action, so the moderation log
  // refetches and shows the entry that action just wrote.
  const [logRefreshToken, setLogRefreshToken] = useState(0)
  const viewer = useViewer()

  return (
    <main data-theme={theme}>
      <h1>Admin Dashboard</h1>
      {viewer && canModerate(viewer) && (
        <>
          <KillSwitchPanel onChanged={() => setLogRefreshToken((token) => token + 1)} />
          <UnaddressedQueuePanel />
          <AdminWarsPanel />
        </>
      )}
      <AdminVotersPanel />
      <ModerationLogPanel refreshToken={logRefreshToken} />
    </main>
  )
}
