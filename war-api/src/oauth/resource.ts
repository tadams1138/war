/**
 * This deployment's own RFC 8707 resource identifier — the one audience the
 * OAuth 2.1 authorization server (§4.3) ever issues a token for in this
 * slice, per spec §4.3.2: "`${PUBLIC_BASE_URL}/api/v1/mcp` — no other value
 * is issued for in this slice."
 */
export function mcpResourceIdentifier(apiBaseUrl: string): string {
  return `${apiBaseUrl}/api/v1/mcp`;
}

/**
 * The absolute RFC 9728 Protected Resource Metadata URL for this
 * deployment's one resource (spec §4.3.5, §4.3.6) — the value a `401`'s
 * `WWW-Authenticate: Bearer resource_metadata="..."` header names so a
 * compliant MCP client can discover this API's own issuer and retry the
 * OAuth dance on its own. Derived from {@link mcpResourceIdentifier} rather
 * than a second hardcoded literal, so the two cannot drift apart — mirrors
 * `registerOAuthDiscoveryRoutes`'s own derivation of the route path itself
 * (`src/oauth/routes.ts`).
 */
export function protectedResourceMetadataUrl(apiBaseUrl: string): string {
  const path = new URL(mcpResourceIdentifier(apiBaseUrl)).pathname;
  return `${apiBaseUrl}/.well-known/oauth-protected-resource${path}`;
}
