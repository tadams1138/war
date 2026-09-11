import { describe, expect, it } from 'vitest';
import { mapMicrosoftProfile } from '../../../../src/auth/providers/microsoft.js';

describe('mapMicrosoftProfile', () => {
  it('maps the subject and name claims to an OAuthProfile', () => {
    // Arrange
    const claims = { sub: 'ms-subject-123', name: 'Pat Example' };

    // Act
    const profile = mapMicrosoftProfile(claims);

    // Assert
    expect(profile).toEqual({ providerUserId: 'ms-subject-123', displayName: 'Pat Example', avatarUrl: null });
  });

  it('leaves display_name null when the claim is missing', () => {
    // Arrange
    const claims = { sub: 'ms-subject-456' };

    // Act
    const profile = mapMicrosoftProfile(claims);

    // Assert
    expect(profile.displayName).toBeNull();
  });

  it('throws when there is no subject claim to identify the voter by', () => {
    // Arrange / Act / Assert
    expect(() => mapMicrosoftProfile(undefined)).toThrow('Microsoft did not return a subject claim');
  });
});
