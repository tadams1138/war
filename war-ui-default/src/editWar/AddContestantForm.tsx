// EditWar's "+ Add contestant" panel. Rendering only -- state and the API
// call live in useEditWar.
import { useState, type FormEvent } from 'react'
import type { ContestantDetail } from '../api/client'
import { BioEditor } from '../bio/BioEditor'

interface AddContestantFormProps {
  error: string | null
  onAdd: (name: string, bio: string | null) => Promise<ContestantDetail | null>
  onAdded: (contestant: ContestantDetail) => void
}

export function AddContestantForm({ error, onAdd, onAdded }: AddContestantFormProps) {
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [nameRequiredError, setNameRequiredError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // Checked before any request goes out (the spec, "client-side
    // validate mandatory fields") -- an empty name is never valid.
    if (name.trim().length === 0) {
      setNameRequiredError('Name is required')
      return
    }
    setNameRequiredError(null)
    const contestant = await onAdd(name, bio.length > 0 ? bio : null)
    if (contestant) onAdded(contestant)
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Add contestant</h2>
      <label>
        Name
        <input
          data-testid="add-contestant-name-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <BioEditor value={bio} onChange={setBio} />
      {(nameRequiredError || error) && (
        <p role="alert" data-testid="add-contestant-error">
          {nameRequiredError ?? error}
        </p>
      )}
      <button type="submit" data-testid="add-contestant-submit">
        Add contestant
      </button>
    </form>
  )
}
