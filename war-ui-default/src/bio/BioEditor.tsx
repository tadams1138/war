// Textarea + formatting toolbar for a contestant's bio (the spec's
// constrained markdown subset: bold, italic, lists, links). All actual
// text-insertion logic lives in bioFormat.ts (unit-tested); this component
// is wiring only — reading the textarea's current selection, calling
// applyBioFormat, and restoring the resulting selection after React commits
// the new value.
import { useEffect, useRef, type ReactElement } from 'react'
import { BioContent } from './BioContent'
import { applyBioFormat, type BioFormatMarker, type TextSelection } from './bioFormat'

interface BioEditorProps {
  value: string
  onChange: (value: string) => void
}

// One 18x18 stroke icon per marker (currentColor, so each theme's own
// button text color applies with no extra per-theme rule needed) — plain
// text labels ("Bold", "Italic", ...) read as an unstyled placeholder
// toolbar; the accessible name moves to aria-label on the button itself.
const ICONS: Record<BioFormatMarker, ReactElement> = {
  heading1: (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2.5 3.5v11M8 3.5v11M2.5 9H8" strokeLinecap="round" />
      <text x="10.5" y="12.5" fontSize="7" fill="currentColor" stroke="none">
        1
      </text>
    </svg>
  ),
  heading2: (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2.5 3.5v11M8 3.5v11M2.5 9H8" strokeLinecap="round" />
      <text x="10" y="12.5" fontSize="7" fill="currentColor" stroke="none">
        2
      </text>
    </svg>
  ),
  heading3: (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2.5 3.5v11M8 3.5v11M2.5 9H8" strokeLinecap="round" />
      <text x="10" y="12.5" fontSize="7" fill="currentColor" stroke="none">
        3
      </text>
    </svg>
  ),
  bold: (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M5 3h5a3 3 0 0 1 0 6H5V3Zm0 6h5.5a3.2 3.2 0 0 1 0 6H5V9Z" strokeLinejoin="round" />
    </svg>
  ),
  italic: (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M8 3h5M5 15h5M10.5 3 7.5 15" strokeLinecap="round" />
    </svg>
  ),
  bulletList: (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="3" cy="4.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="13.5" r="1" fill="currentColor" stroke="none" />
      <path d="M7 4.5h8M7 9h8M7 13.5h8" strokeLinecap="round" />
    </svg>
  ),
  numberedList: (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M7 4.5h8M7 9h8M7 13.5h8" strokeLinecap="round" />
      <text x="1" y="6" fontSize="4.5" fill="currentColor" stroke="none">
        1
      </text>
      <text x="1" y="10.5" fontSize="4.5" fill="currentColor" stroke="none">
        2
      </text>
      <text x="1" y="15" fontSize="4.5" fill="currentColor" stroke="none">
        3
      </text>
    </svg>
  ),
  link: (
    <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M7.5 10.5 10.5 7.5M6 11 4 13a2.5 2.5 0 0 1-3.5-3.5l2-2M12 7l2-2a2.5 2.5 0 0 0-3.5-3.5l-2 2" strokeLinecap="round" strokeLinejoin="round" transform="translate(3 3)" />
    </svg>
  ),
}

const TOOLBAR_BUTTONS: { marker: BioFormatMarker; label: string; testId: string }[] = [
  { marker: 'heading1', label: 'Heading 1', testId: 'bio-format-heading1' },
  { marker: 'heading2', label: 'Heading 2', testId: 'bio-format-heading2' },
  { marker: 'heading3', label: 'Heading 3', testId: 'bio-format-heading3' },
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
      <div className="bio-editor-input">
        <div role="toolbar" aria-label="Bio formatting" className="bio-editor-toolbar">
          {TOOLBAR_BUTTONS.map(({ marker, label, testId }) => (
            <button key={marker} type="button" data-testid={testId} aria-label={label} onClick={() => applyFormat(marker)}>
              {ICONS[marker]}
            </button>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          data-testid="bio-textarea"
          aria-label="Bio"
          rows={8}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {/* Names the actual renderer (renderBio.ts) rather than linking
            generic Markdown docs -- marked parses full CommonMark, but only
            bold/italic/lists/links/headings survive renderBio's DOMPurify
            allow-list, so anything else typed here silently does nothing. */}
        <p className="bio-editor-hint">
          Formatted with{' '}
          <a href="https://marked.js.org/demo/" target="_blank" rel="noreferrer" data-testid="bio-syntax-link">
            marked
          </a>{' '}
          — only bold, italic, lists, links, and headings are supported.
        </p>
      </div>
      {/* Live, on large screens only (CSS): reuses the same tested
          renderBio a saved bio goes through on WarDetail, so this can never
          show something the real page wouldn't. */}
      <div className="bio-editor-preview" data-testid="bio-preview" aria-label="Bio preview">
        <BioContent bio={value} />
      </div>
    </div>
  )
}
