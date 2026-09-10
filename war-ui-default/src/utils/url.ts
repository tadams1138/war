// ContestantAttributes renders a url-typed value as a link only when it is
// genuinely http(s) — the spec.
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
