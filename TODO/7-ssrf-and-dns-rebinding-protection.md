# 7 — SSRF and DNS-rebinding protection

## Summary
Only needed if the API fetches a user-supplied URL again. Nothing fetches one today, so no
protection exists. If that need returns, recover the address classifier and the connect-time
DNS-rebinding guard from git history rather than rewriting them.

## Technical notes
- The code was removed in commit `cd7f5a4` ("Remove the MCP interface and the OAuth 2.1
  authorization server"), which deleted `war-api/src/oauth/` and `war-api/src/mcp/`. Recover with
  `git show cd7f5a4^:war-api/src/oauth/ipGuard.ts` and its test
  `git show cd7f5a4^:war-api/test/unit/ipGuard.test.ts`. It was written for the Client ID
  Metadata Document resolver. The connect-time DNS-rebinding guard that used it is in
  `git show cd7f5a4^:war-api/src/oauth/cimdClientStore.ts`: an injectable `dns/promises`
  lookup passed to the socket as a `LookupFunction`, so the address that was checked is the
  address connected to.
- `ipGuard.ts` held a table of blocked IPv4 ranges (loopback, private, link-local, carrier-grade
  NAT, reserved and benchmark blocks, multicast, broadcast), blocked IPv6 prefixes, and the IPv6
  prefixes that embed an IPv4 address.
- Possible triggers: URL-attached videos for #1, or fetching a remote image on import.

## Open questions
- Whether any planned feature will fetch user-supplied URLs server-side; if not, this stays
  unbuilt.
