import { randomBytes, createHash } from 'node:crypto';

/** Authorization codes expire 60 seconds after issuance (spec §4.3.4). */
export const AUTHORIZATION_CODE_TTL_MS = 60 * 1000;

/** Generates a new opaque authorization-code value. Never stored in plaintext (spec §4.3.4, §6). */
export function generateAuthorizationCode(): string {
  return randomBytes(32).toString('base64url');
}

/** Hashes an authorization-code value for storage/lookup (spec §6: SHA-256). */
export function hashAuthorizationCode(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * A random string shaped like a real PKCE `code_challenge`, handed back in
 * place of a genuine one when no matching, unexpired, unused code exists for
 * the presented client.
 *
 * Spec §4.3.4 is explicit that "this endpoint does not distinguish 'no such
 * code' from 'wrong verifier'" — both must produce the exact same `400
 * invalid_grant` body. Returning a decoy here (rather than throwing a
 * distinguishable error) routes both cases through the identical
 * `verifyChallenge(code_verifier, codeChallenge)` failure the SDK's token
 * handler already produces for a genuinely wrong verifier, so the two
 * failures are byte-identical rather than merely sharing an error code.
 */
export function decoyCodeChallenge(): string {
  return randomBytes(32).toString('base64url');
}
