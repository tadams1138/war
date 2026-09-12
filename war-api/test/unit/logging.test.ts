import { describe, expect, it } from 'vitest';
import { redactedRequestSerializer } from '../../src/logging.js';

describe('redactedRequestSerializer', () => {
  it('strips the query string from the logged url, keeping only the path', () => {
    // Arrange
    const request = {
      method: 'GET',
      url: '/api/v1/auth/twitter/callback?state=abc123&code=a-one-time-provider-code',
    };

    // Act
    const logged = redactedRequestSerializer(request);

    // Assert
    expect(logged).toEqual({ method: 'GET', url: '/api/v1/auth/twitter/callback' });
  });

  it('leaves a url with no query string unchanged', () => {
    // Arrange
    const request = { method: 'GET', url: '/api/v1/health' };

    // Act
    const logged = redactedRequestSerializer(request);

    // Assert
    expect(logged).toEqual({ method: 'GET', url: '/api/v1/health' });
  });

  it('preserves the method for a non-GET request', () => {
    // Arrange
    const request = { method: 'POST', url: '/api/v1/auth/refresh' };

    // Act
    const logged = redactedRequestSerializer(request);

    // Assert
    expect(logged.method).toBe('POST');
  });
});
