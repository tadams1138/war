// Staff-only Admin Dashboard (war-spec.md §10.1 routes table; §6.7).
import { useState } from 'react'
import { KillSwitchPanel } from '../admin/KillSwitchPanel'
import { ModerationLogPanel } from '../admin/ModerationLogPanel'
import { AdminVotersPanel } from '../admin/voters/AdminVotersPanel'
import { AdminWarsPanel } from '../admin/wars/AdminWarsPanel'
import { UnaddressedQueuePanel } from '../admin/wars/UnaddressedQueuePanel'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'

export function AdminDashboard() {
  const [theme, setTheme] = useTheme('home', 'arcade')
  usePublishTheme('home', theme, setTheme)
  // Bumped whenever a panel takes a Staff action, so the moderation log
  // refetches and shows the entry that action just wrote.
  const [logRefreshToken, setLogRefreshToken] = useState(0)

  return (
    <main data-theme={theme}>
      <h1>Admin Dashboard</h1>
      <KillSwitchPanel onChanged={() => setLogRefreshToken((token) => token + 1)} />
      <UnaddressedQueuePanel />
      <AdminWarsPanel />
      <AdminVotersPanel />
      <ModerationLogPanel refreshToken={logRefreshToken} />
    </main>
  )
}
