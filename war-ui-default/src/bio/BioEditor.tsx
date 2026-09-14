// Textarea + formatting toolbar for a contestant's bio (the spec's
// constrained markdown subset: bold, italic, lists, links). All actual
// text-insertion logic lives in bioFormat.ts (unit-tested); this component
// is wiring only — reading the textarea's current selection, calling
// applyBioFormat, and restoring the resulting selection after React commits
// the new value.
import { useEffect, useRef } from 'react'
import { applyBioFormat, type BioFormatMarker, type TextSelection } from './bioFormat'

interface BioEditorProps {
  value: string
  onChange: (value: string) => void
}

const TOOLBAR_BUTTONS: { marker: BioFormatMarker; label: string; testId: string }[] = [
  { marker: 'bold', label: 'Bold', testId: 'bio-format-bold' },
  { marker: 'italic', label: 'Italic', testId: 'bio-format-italic' },
  { marker: 'bulletList', label: 'Bullet list', testId: 'bio-format-bullet-list' },
  { marker: 'numberedList', label: 'Numbered list', testId: 'bio-format-numbered-list' },
  { marker: 'link', label: 'Link', testId: 'bio-format-link' },
]

export function BioEditor({ value, onChange }: BioEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingSelectionRef = useRef<TextSelection | null>(null)

  // Runs once the textarea's value prop has actually updated to the text a
  // toolbar click produced — setSelectionRange in the click handler itself
  // would apply to the textarea's still-stale value.
  useEffect(() => {
    const pending = pendingSelectionRef.current
    const textarea = textareaRef.current
    if (!pending || !textarea) return
    textarea.focus()
    textarea.setSelectionRange(pending.start, pending.end)
    pendingSelectionRef.current = null
  }, [value])

  function applyFormat(marker: BioFormatMarker) {
    const textarea = textareaRef.current
    if (!textarea) return
    const selection = { start: textarea.selectionStart, end: textarea.selectionEnd }
    const result = applyBioFormat(value, selection, marker)
    pendingSelectionRef.current = result.selection
    onChange(result.text)
  }

  return (
    <div className="bio-editor">
      <div role="toolbar" aria-label="Bio formatting" className="bio-editor-toolbar">
        {TOOLBAR_BUTTONS.map(({ marker, label, testId }) => (
          <button key={marker} type="button" data-testid={testId} aria-label={label} onClick={() => applyFormat(marker)}>
            {label}
          </button>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        data-testid="bio-textarea"
        aria-label="Bio"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
