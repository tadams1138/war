import { describe, expect, it } from 'vitest';
import { mapTwitterProfile } from '../../../../src/auth/providers/twitter.js';

describe('mapTwitterProfile', () => {
  it('maps the users/me response to an OAuthProfile', () => {
    // Arrange
    const me = { data: { id: 'tw-123', name: 'Pat Example', profile_image_url: 'https://example.com/pat.jpg' } };

    // Act
    const profile = mapTwitterProfile(me);

    // Assert
    expect(profile).toEqual({ providerUserId: 'tw-123', displayName: 'Pat Example', avatarUrl: 'https://example.com/pat.jpg' });
  });

  it('leaves display_name and avatar_url null when Twitter/X omits them', () => {
    // Arrange
    const me = { data: { id: 'tw-456' } };

    // Act
    const profile = mapTwitterProfile(me);

    // Assert
    expect(profile).toEqual({ providerUserId: 'tw-456', displayName: null, avatarUrl: null });
  });

  it('throws when there is no account id to identify the voter by', () => {
    // Arrange / Act / Assert
    expect(() => mapTwitterProfile({ data: { id: '' } })).toThrow('Twitter/X did not return an account id');
  });
});
