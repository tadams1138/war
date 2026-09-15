// A War's display title falls back to a placeholder until its creator sets
// one -- `wars.title` is nullable (single-page War creation creates an
// untitled draft up front). Shared by WarCard, WarDetail, and EditWar so the
// fallback text can never drift between them.
export function warTitle(title: string | null): string {
  return title || 'Untitled War'
}
