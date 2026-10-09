import { describe, expect, it } from 'vitest';
import {
  assertProductionConfig,
  defaultPublicBaseUrl,
  DEFAULT_UI_ORIGIN,
  loadConfig,
  type AppConfig,
} from '../../src/config.js';

function fullyPopulatedConfig(): AppConfig {
  return loadConfig({
    DATABASE_URL: 'postgres://user:pass@host:5432/db',
    JWT_SECRET: 'a-real-production-secret',
    INTERNAL_TASK_TOKEN: 'a-real-internal-task-token',
    GOOGLE_CLIENT_ID: 'a-real-client-id',
    GOOGLE_CLIENT_SECRET: 'a-real-client-secret',
    MICROSOFT_CLIENT_ID: 'a-real-client-id',
    MICROSOFT_CLIENT_SECRET: 'a-real-client-secret',
    FACEBOOK_CLIENT_ID: 'a-real-client-id',
    FACEBOOK_CLIENT_SECRET: 'a-real-client-secret',
    TWITTER_CLIENT_ID: 'a-real-client-id',
    TWITTER_CLIENT_SECRET: 'a-real-client-secret',
    PUBLIC_BASE_URL: 'https://staging.war.tmad.dev',
    UI_ORIGINS: 'https://staging.war.tmad.dev',
  } as NodeJS.ProcessEnv);
}

describe('assertProductionConfig', () => {
  it('throws when no environment variables are set and every secret defaults', () => {
    // Arrange
    const config = loadConfig({} as NodeJS.ProcessEnv);

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow();
  });

  it('throws when JWT_SECRET is left at its published test default', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.jwtSecret = 'test-secret-do-not-use-in-production';

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow(/jwt/i);
  });

  it('throws when INTERNAL_TASK_TOKEN is left at its published test default', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.internalTaskToken = 'test-internal-token';

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow(/internal/i);
  });

  it('throws when DATABASE_URL is unset', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.databaseUrl = '';

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow();
  });

  it('throws when Google client credentials are unset', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.oauthProviders.google = { clientId: '', clientSecret: '' };

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow();
  });

  it('throws when Microsoft client credentials are unset', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.oauthProviders.microsoft = { clientId: '', clientSecret: '' };

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow(/microsoft/i);
  });

  it('throws when Facebook client credentials are unset', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.oauthProviders.facebook = { clientId: '', clientSecret: '' };

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow(/facebook/i);
  });

  it('throws when Twitter/X client credentials are unset', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.oauthProviders.twitter = { clientId: '', clientSecret: '' };

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow(/twitter/i);
  });

  it('does not throw for a fully-populated production config', () => {
    // Arrange
    const config = fullyPopulatedConfig();

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).not.toThrow();
  });

  it('throws when apiBaseUrl is left at its localhost default for the configured port', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.apiBaseUrl = defaultPublicBaseUrl(config.port);

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow(/public.*base.*url/i);
  });

  it('throws when apiBaseUrl is the empty string', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.apiBaseUrl = '';

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow();
  });

  it('does not throw when apiBaseUrl is a real, non-default value', () => {
    // Arrange
    const config = fullyPopulatedConfig();

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).not.toThrow();
    expect(config.apiBaseUrl).toBe('https://staging.war.tmad.dev');
  });

  it('throws when apiBaseUrl has a trailing slash', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.apiBaseUrl = 'https://staging.war.tmad.dev/';

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow(/trailing slash/i);
  });

  it('throws when apiBaseUrl does not parse as an absolute http(s) URL', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.apiBaseUrl = 'not-a-url';

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow(/absolute http/i);
  });

  it('throws when uiOrigins is left at its localhost default', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.uiOrigins = [DEFAULT_UI_ORIGIN];

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow(/ui_origins/i);
  });

  it('throws when uiOrigins is empty', () => {
    // Arrange
    const config = fullyPopulatedConfig();
    config.uiOrigins = [];

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).toThrow(/ui_origins/i);
  });

  it('does not throw when uiOrigins is a real, non-default value', () => {
    // Arrange
    const config = fullyPopulatedConfig();

    // Act
    const act = () => assertProductionConfig(config);

    // Assert
    expect(act).not.toThrow();
    expect(config.uiOrigins).toEqual(['https://staging.war.tmad.dev']);
  });
});

describe('loadConfig trustProxyHops', () => {
  it('leaves the proxy hop count unset by default, which turns address-keyed rate limits off', () => {
    // Arrange
    const env = {} as NodeJS.ProcessEnv;

    // Act
    const config = loadConfig(env);

    // Assert
    expect(config.trustProxyHops).toBeUndefined();
  });

  it('reads the number of reverse-proxy hops from TRUST_PROXY_HOPS', () => {
    // Arrange
    const env = { TRUST_PROXY_HOPS: '2' } as NodeJS.ProcessEnv;

    // Act
    const config = loadConfig(env);

    // Assert
    expect(config.trustProxyHops).toBe(2);
  });
});
