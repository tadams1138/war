import { BlockList, isIPv4, isIPv6 } from 'node:net';

interface BlockedCidr {
  readonly address: string;
  readonly prefix: number;
}

/**
 * Every IPv4 range this SSRF guard refuses to fetch (spec §4.3.3): loopback,
 * private, and link-local, plus the ranges design review Finding 2 (of
 * 513ee16) named as missing entirely -- carrier-grade NAT, the IETF/
 * benchmark reserved blocks, multicast, the top reserved block, and the
 * limited broadcast address. One row per range, so a test can enumerate
 * them directly rather than reverse-engineering the classifier's branches.
 */
const BLOCKED_IPV4_CIDRS: readonly BlockedCidr[] = [
  { address: '0.0.0.0', prefix: 8 }, // "this network" / unspecified
  { address: '10.0.0.0', prefix: 8 }, // private, class A
  { address: '100.64.0.0', prefix: 10 }, // CGNAT (RFC 6598) -- provider-internal traffic
  { address: '127.0.0.0', prefix: 8 }, // loopback
  { address: '169.254.0.0', prefix: 16 }, // link-local
  { address: '172.16.0.0', prefix: 12 }, // private, class B
  { address: '192.0.0.0', prefix: 24 }, // IETF protocol assignments
  { address: '192.168.0.0', prefix: 16 }, // private, class C
  { address: '198.18.0.0', prefix: 15 }, // benchmark testing
  { address: '224.0.0.0', prefix: 4 }, // multicast
  { address: '240.0.0.0', prefix: 4 }, // reserved (also covers 255.255.255.255 below)
  { address: '255.255.255.255', prefix: 32 }, // limited broadcast, named explicitly
];

/** Every IPv6 range blocked directly, by prefix -- no IPv4 decoding involved. */
const BLOCKED_IPV6_CIDRS: readonly BlockedCidr[] = [
  { address: '::', prefix: 128 }, // unspecified
  { address: '::1', prefix: 128 }, // loopback
  { address: 'fc00::', prefix: 7 }, // unique local
  { address: 'fe80::', prefix: 10 }, // link-local
  { address: 'fec0::', prefix: 10 }, // deprecated site-local
  { address: '2002::', prefix: 16 }, // 6to4 -- relayed through an anycast gateway, never a legitimate direct target
  { address: 'ff00::', prefix: 8 }, // multicast
];

/**
 * IPv6 prefixes that embed an IPv4 address in their low 32 bits (spec
 * §4.3.3, design review Finding 2): the same blocked IPv4 ranges above
 * reach right back to the same hosts through any of these forms (the
 * dotted and hex spellings of IPv4-mapped are the identical bits, so one
 * embedding covers both). Each is registered as its own IPv6 subnet per
 * blocked range, rather than decoded at check time.
 */
const IPV4_EMBEDDING_PREFIXES: ReadonlyArray<(v4: string) => string> = [
  (v4) => `::ffff:${v4}`, // IPv4-mapped (RFC 4291)
  (v4) => `::ffff:0:${v4}`, // IPv4-translated (RFC 2765 / RFC 6052)
  (v4) => `64:ff9b::${v4}`, // NAT64 well-known prefix (RFC 6052)
];
const IPV4_EMBEDDING_PREFIX_BITS = 96;

function buildBlockList(): BlockList {
  const blockList = new BlockList();
  for (const { address, prefix } of BLOCKED_IPV4_CIDRS) {
    blockList.addSubnet(address, prefix, 'ipv4');
  }
  for (const { address, prefix } of BLOCKED_IPV6_CIDRS) {
    blockList.addSubnet(address, prefix, 'ipv6');
  }
  for (const embed of IPV4_EMBEDDING_PREFIXES) {
    for (const { address, prefix } of BLOCKED_IPV4_CIDRS) {
      blockList.addSubnet(embed(address), IPV4_EMBEDDING_PREFIX_BITS + prefix, 'ipv6');
    }
  }
  return blockList;
}

const blockList = buildBlockList();

/**
 * True when `address` (a resolved IP, not a hostname) must never be
 * fetched by the Client ID Metadata Document resolver (spec §4.3.3): a
 * loopback, private, or link-local address, in either address family, or
 * any of the other ranges above -- including every one of them reached
 * through an IPv4-in-IPv6 embedding.
 */
export function isDisallowedHostAddress(address: string): boolean {
  if (isIPv4(address)) {
    return blockList.check(address, 'ipv4');
  }
  if (isIPv6(address)) {
    return blockList.check(address, 'ipv6');
  }
  return true; // not a recognizable IP literal — refuse rather than guess
}
