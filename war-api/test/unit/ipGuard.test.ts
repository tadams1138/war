import { describe, expect, it } from 'vitest';
import { isDisallowedHostAddress } from '../../src/oauth/ipGuard.js';

describe('isDisallowedHostAddress (spec §4.3.3 SSRF guard)', () => {
  it.each([
    ['127.0.0.1', 'IPv4 loopback'],
    ['127.5.5.5', 'IPv4 loopback range'],
    ['10.0.0.5', 'IPv4 private class A'],
    ['172.16.0.5', 'IPv4 private class B'],
    ['172.31.255.255', 'IPv4 private class B upper bound'],
    ['192.168.1.1', 'IPv4 private class C'],
    ['169.254.1.1', 'IPv4 link-local'],
    ['0.0.0.0', 'unspecified address'],
    ['::1', 'IPv6 loopback'],
    ['fe80::1', 'IPv6 link-local'],
    ['fc00::1', 'IPv6 unique local'],
    ['fd12:3456:789a::1', 'IPv6 unique local (fd)'],
    // Design review of 513ee16, Finding 2: address forms the classifier
    // missed entirely -- each of these reaches a blocked IPv4 host and was
    // accepted (returned `false`) before the table-driven rewrite.
    ['::ffff:7f00:1', 'IPv4-mapped IPv6, hex form, reaching 127.0.0.1'],
    ['::ffff:a00:1', 'IPv4-mapped IPv6, hex form, reaching 10.0.0.1'],
    ['::ffff:0:127.0.0.1', 'IPv4-translated IPv6 (RFC 2765/6052), reaching loopback'],
    ['64:ff9b::127.0.0.1', 'NAT64 well-known prefix (RFC 6052), reaching loopback'],
    ['2002:7f00:1::', '6to4 (2002::/16), reaching loopback'],
    ['ff02::1', 'IPv6 multicast'],
    ['fec0::1', 'IPv6 deprecated site-local'],
    ['100.64.0.1', 'IPv4 carrier-grade NAT (RFC 6598)'],
    ['192.0.0.5', 'IPv4 IETF protocol assignments'],
    ['198.18.0.1', 'IPv4 benchmark testing'],
    ['224.0.0.1', 'IPv4 multicast'],
    ['240.0.0.1', 'IPv4 reserved'],
    ['255.255.255.255', 'IPv4 limited broadcast'],
  ])('rejects %s (%s)', (address) => {
    // Arrange & Act
    const result = isDisallowedHostAddress(address);

    // Assert
    expect(result).toBe(true);
  });

  it.each([
    ['8.8.8.8', 'a public IPv4 address'],
    ['93.184.216.34', 'another public IPv4 address'],
    ['2001:4860:4860::8888', 'a public IPv6 address'],
    // Boundary pairs just outside a blocked range (design review Finding 5:
    // the previous suite never enumerated a false-boundary case, so a
    // range-arithmetic bug widening a block could never have failed a test).
    ['172.15.255.255', 'just below the private 172.16.0.0/12 range'],
    ['172.32.0.0', 'just above the private 172.16.0.0/12 range'],
    ['100.63.255.255', 'just below the CGNAT 100.64.0.0/10 range'],
    ['100.128.0.0', 'just above the CGNAT 100.64.0.0/10 range'],
    ['::ffff:8.8.8.8', 'IPv4-mapped IPv6 of a public address -- mapping alone must not blanket-block'],
    ['2001:db8::1', 'public IPv6, outside every blocked range including 2002::/16'],
  ])('allows %s (%s)', (address) => {
    // Arrange & Act
    const result = isDisallowedHostAddress(address);

    // Assert
    expect(result).toBe(false);
  });
});
