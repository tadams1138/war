import { isIPv4, isIPv6 } from 'node:net';

/**
 * Checks whether a raw IPv4 address falls in a loopback, private, or
 * link-local range (spec §4.3.3's SSRF guard: "resolves and rejects any
 * target resolving to a private, loopback, or link-local address").
 */
function isDisallowedIPv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) {
    return true; // unparseable input is refused, not passed through
  }
  const [a, b] = octets as [number, number, number, number];
  if (a === 127) return true; // loopback, 127.0.0.0/8
  if (a === 10) return true; // private, 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // private, 172.16.0.0/12
  if (a === 192 && b === 168) return true; // private, 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local, 169.254.0.0/16
  if (a === 0) return true; // unspecified/"this network"
  return false;
}

/**
 * Checks whether a raw IPv6 address falls in a loopback, unique-local, or
 * link-local range.
 */
function isDisallowedIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true; // loopback / unspecified
  if (normalized.startsWith('fe80:') || normalized.startsWith('fe8') || /^fe[89ab][0-9a-f]:/.test(normalized)) return true; // link-local, fe80::/10
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local, fc00::/7
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — classify by the embedded IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) return isDisallowedIPv4(mapped[1]!);
  return false;
}

/**
 * True when `address` (a resolved IP, not a hostname) must never be
 * fetched by the Client ID Metadata Document resolver (spec §4.3.3): a
 * loopback, private, or link-local address, in either address family.
 */
export function isDisallowedHostAddress(address: string): boolean {
  if (isIPv4(address)) {
    return isDisallowedIPv4(address);
  }
  if (isIPv6(address)) {
    return isDisallowedIPv6(address);
  }
  return true; // not a recognizable IP literal — refuse rather than guess
}
