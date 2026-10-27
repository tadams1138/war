import { useState, useSyncExternalStore } from 'react'
import { videoDebugEnabled, videoDebugLog } from './debugLog'

// Temporary: the on-screen video playback log shown with `?debug`.
export function VideoDebugPanel() {
  const entries = useSyncExternalStore(videoDebugLog.subscribe, videoDebugLog.entries)
  const [copied, setCopied] = useState(false)
  if (!videoDebugEnabled()) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(entries.join('\n'))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return <div className="video-debug-log" data-testid="video-debug-log">
    <button type="button" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy log'}</button>
    <pre>{entries.join('\n')}</pre>
  </div>
}
