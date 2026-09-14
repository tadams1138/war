// Turns a contestant's bio (markdown source, stored verbatim in the plain
// TEXT `bio` column — no schema change; see BioEditor) into sanitized HTML
// for display. The allow-list covers exactly the spec's three
// formatting features — emphasis, lists, links — plus the paragraph/break
// tags marked itself wraps output in; nothing else survives, so a bio
// containing a <script> or an event-handler attribute renders as inert text
// or is dropped outright, never executes.
import DOMPurify from 'dompurify'
import { marked } from 'marked'

const ALLOWED_TAGS = ['p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'br']
const ALLOWED_ATTR = ['href']

export function renderBio(bio: string | null | undefined): string {
  if (!bio) return ''
  const html = marked.parse(bio, { async: false }) as string
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}
