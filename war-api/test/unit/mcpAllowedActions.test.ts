import { describe, expect, it } from 'vitest';
import * as allowedActions from '../../src/mcp/allowedActions.js';

/**
 * Pins section 7.9's "Service-Layer Allowlist" — the module boundary that
 * makes "every MCP tool handler calls only an allowed service function" a
 * structurally visible property rather than a convention. Gherkin scenario
 * "The MCP allowlist exports exactly the approved service functions" (spec
 * §14, "Service-Layer Allowlist" feature).
 */
describe('src/mcp/allowedActions.ts (spec §7.9: the service-layer allowlist)', () => {
  it('exports exactly the ten approved service functions, sorted, no more and no fewer', () => {
    // Arrange
    const expected = [
      'activateWar',
      'addContestant',
      'addContestantImage',
      'closeWar',
      'createWarForVoter',
      'getWar',
      'listWarsForVoter',
      'patchContestant',
      'patchWar',
      'rankingsFor',
    ].sort();

    // Act
    const actual = Object.keys(allowedActions).sort();

    // Assert
    expect(actual).toEqual(expected);
  });

  it('exports every allowed function as a callable', () => {
    // Arrange & Act
    const values = Object.values(allowedActions);

    // Assert
    expect(values.every((value) => typeof value === 'function')).toBe(true);
  });
});
