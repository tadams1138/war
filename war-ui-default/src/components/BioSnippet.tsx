// Truncates a long bio behind a "More"/"Less" toggle (war-spec.md 10.4) —
// a plain character-count heuristic, not real overflow detection: measuring
// actual rendered overflow needs a DOM pass this component has no reason to
// do, and a bio long enough to matter is long enough in its raw text too.
// Truncation is CSS-only (line-clamp on the rendered bio) — the full HTML
// stays in the DOM either way, so BioContent's own tests are unaffected by
// whichever state this starts in.
import { useState } from 'react'
import { BioContent } from '../bio/BioContent'

const TRUNCATE_THRESHOLD = 140

interface BioSnippetProps {
  bio: string | null
}

function clampClass(needsToggle: boolean, expanded: boolean): string | undefined {
  return needsToggle && !expanded ? 'bio-snippet-clamped' : undefined
}

export function BioSnippet({ bio }: BioSnippetProps) {
  const [expanded, setExpanded] = useState(false)
  if (!bio) return null

  const needsToggle = bio.length > TRUNCATE_THRESHOLD
  return (
    <div className={clampClass(needsToggle, expanded)}>
      <BioContent bio={bio} />
      {needsToggle && (
        <button type="button" className="bio-snippet-toggle" data-testid="bio-more-toggle" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Less' : 'More'}
        </button>
      )}
    </div>
  )
}
