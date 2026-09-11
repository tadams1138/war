import { describe, expect, it } from 'vitest';
import { mapFacebookProfile } from '../../../../src/auth/providers/facebook.js';

describe('mapFacebookProfile', () => {
  it('maps id, name, and the nested picture URL to an OAuthProfile', () => {
    // Arrange
    const me = { id: 'fb-123', name: 'Pat Example', picture: { data: { url: 'https://example.com/pat.jpg' } } };

    // Act
    const profile = mapFacebookProfile(me);

    // Assert
    expect(profile).toEqual({ providerUserId: 'fb-123', displayName: 'Pat Example', avatarUrl: 'https://example.com/pat.jpg' });
  });

  it('leaves display_name and avatar_url null when Facebook omits them', () => {
    // Arrange
    const me = { id: 'fb-456' };

    // Act
    const profile = mapFacebookProfile(me);

    // Assert
    expect(profile).toEqual({ providerUserId: 'fb-456', displayName: null, avatarUrl: null });
  });

  it('throws when there is no account id to identify the voter by', () => {
    // Arrange / Act / Assert
    expect(() => mapFacebookProfile({ id: '' })).toThrow('Facebook did not return an account id');
  });
});
