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
  ])('allows %s (%s)', (address) => {
    // Arrange & Act
    const result = isDisallowedHostAddress(address);

    // Assert
    expect(result).toBe(false);
  });
});
