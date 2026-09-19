// Recreates a War from a previously exported file (spec §10.4, "Import").
// A full success forwards to the new draft's Edit page, mirroring Create
// War's own instant-draft-to-Edit-page flow; a partial failure shows its
// error here instead and leaves the (partial) draft findable via My Wars,
// same as an abandoned Create War draft already is.
import { useNavigate } from 'react-router-dom'
import { useWarImport } from '../import/useWarImport'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'

export function ImportWar() {
  const navigate = useNavigate()
  const { state, importFile } = useWarImport((warId) => navigate(`/wars/${warId}/edit`))
  const [theme, setTheme] = useTheme('home', 'arcade')
  usePublishTheme('home', theme, setTheme)

  return (
    <main data-theme={theme}>
      <h1>Import a War</h1>
      <label>
        Choose a War export file
        <input
          type="file"
          accept=".zip"
          data-testid="import-war-input"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) importFile(file)
          }}
        />
      </label>
      {state.importing && <p>Importing…</p>}
      {state.error && (
        <p role="alert" data-testid="import-war-error">
          {state.error}
        </p>
      )}
    </main>
  )
}
