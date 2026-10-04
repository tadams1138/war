/** Escapes `%`, `_`, and `\` so a raw search term is matched literally by `ILIKE`, never as a wildcard. */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** A case-insensitive "contains" `ILIKE` pattern for a raw search term. */
export function containsPattern(raw: string): string {
  return `%${escapeLikePattern(raw)}%`;
}
