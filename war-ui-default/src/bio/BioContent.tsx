// Renders a contestant's bio as formatted HTML. `renderBio` (unit-tested)
// owns every sanitization decision — this component trusts its output
// completely rather than re-deciding what's safe here.
import { renderBio } from './renderBio'

interface BioContentProps {
  bio: string | null
}

export function BioContent({ bio }: BioContentProps) {
  const html = renderBio(bio)
  if (!html) return null
  return <div data-testid="contestant-bio" dangerouslySetInnerHTML={{ __html: html }} />
}
