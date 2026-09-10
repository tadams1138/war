/**
 * This deployment's own RFC 8707 resource identifier — the one audience the
 * OAuth 2.1 authorization server (§4.3) ever issues a token for in this
 * slice, per spec §4.3.2: "`${PUBLIC_BASE_URL}/api/v1/mcp` — no other value
 * is issued for in this slice."
 */
export function mcpResourceIdentifier(apiBaseUrl: string): string {
  return `${apiBaseUrl}/api/v1/mcp`;
}
