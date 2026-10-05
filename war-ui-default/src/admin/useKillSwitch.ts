// State machine behind the kill switch panel (the spec, §6.7): the current
// switch state, an in-page confirmation step before ENABLING it (it stops all
// War creation), and an error that leaves the shown state unchanged.
import { useState } from 'react'
import { getKillSwitch, setKillSwitch } from '../api/client'
import { toUserMessage } from '../api/errors'
import { useAsyncResource, type AsyncResourceState } from '../hooks/useAsyncResource'

export interface UseKillSwitchResult {
  state: AsyncResourceState<boolean>
  confirming: boolean
  saving: boolean
  actionError: string | null
  requestChange: (enabled: boolean) => void
  confirm: () => void
  cancel: () => void
}

export function useKillSwitch(onChanged: () => void): UseKillSwitchResult {
  const loaded = useAsyncResource(() => getKillSwitch(), [])
  const [override, setOverride] = useState<boolean | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const state: AsyncResourceState<boolean> =
    loaded.status === 'loaded' ? { status: 'loaded', value: override ?? loaded.value.enabled } : loaded

  function apply(enabled: boolean) {
    setConfirming(false)
    setSaving(true)
    setActionError(null)
    setKillSwitch(enabled)
      .then((result) => {
        setOverride(result.enabled)
        onChanged()
      })
      .catch((error: unknown) => setActionError(toUserMessage(error)))
      .finally(() => setSaving(false))
  }

  return {
    state,
    confirming,
    saving,
    actionError,
    // Enabling stops all War creation, so it asks first; disabling restores
    // normal service and needs no confirmation.
    requestChange: (enabled) => (enabled ? setConfirming(true) : apply(false)),
    confirm: () => apply(true),
    cancel: () => setConfirming(false),
  }
}
