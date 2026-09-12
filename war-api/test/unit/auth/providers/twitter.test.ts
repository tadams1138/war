import { describe, expect, it } from 'vitest';
import { mapTwitterProfile, rawClientSecretBasic } from '../../../../src/auth/providers/twitter.js';

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

describe('rawClientSecretBasic', () => {
  it('base64-encodes "clientId:clientSecret" without percent-encoding reserved characters', () => {
    // Arrange -- a secret shaped like Twitter/X's actual base64url-alphabet
    // secrets, which routinely contain '-' and '_'. oauth4webapi's own
    // ClientSecretBasic would percent-encode those first (RFC 6749 Appendix
    // B); confirmed against the real endpoint that Twitter/X does not
    // undo that encoding before splitting the credentials on ':', so a
    // form-url-encoded secret is silently wrong from Twitter/X's point of
    // view.
    const auth = rawClientSecretBasic('client-id_1', 'sec.ret~val*ue');
    const headers = new Headers();

    // Act
    auth({} as never, {} as never, new URLSearchParams(), headers);

    // Assert
    const expected = `Basic ${Buffer.from('client-id_1:sec.ret~val*ue').toString('base64')}`;
    expect(headers.get('authorization')).toBe(expected);
  });
});
