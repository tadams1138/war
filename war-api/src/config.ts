/**
 * The convenience defaults `loadConfig` supplies so tests never have to set
 * every secret explicitly. Named here so `assertProductionConfig` can refuse
 * to boot a real deployment left on any of them (spec: auth must not
 * be silently disabled).
 */
export const DEFAULT_JWT_SECRET = 'test-secret-do-not-use-in-production';
export const DEFAULT_INTERNAL_TASK_TOKEN = 'test-internal-token';
export const DEFAULT_UI_ORIGIN = 'http://localhost:5173';

/**
 * The local-dev default for `apiBaseUrl`, port-dependent so it can't be a
 * plain identity constant like `DEFAULT_JWT_SECRET`. Shared by `loadConfig`
 * and `assertProductionConfig` so the two can't drift apart.
 */
export function defaultPublicBaseUrl(port: number): string {
  return `http://localhost:${port}`;
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  uiOrigins: string[];
  jwtSecret: string;
  jwtIssuer: string;
  /**
   * This API's own public base URL (env `PUBLIC_BASE_URL`) — named
   * `apiBaseUrl`, not `publicBaseUrl`, to avoid colliding with the
   * differently-scoped `s3.publicBaseUrl` below (the media CDN's origin).
   */
  apiBaseUrl: string;
  oauthProviders: {
    google: OAuthClientConfig;
    microsoft: OAuthClientConfig;
    facebook: OAuthClientConfig;
    twitter: OAuthClientConfig;
  };
  internalTaskToken: string;
  s3: {
    endpoint: string | undefined;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicBaseUrl: string;
  };
}

function envOr(value: string | undefined, fallback: string): string {
  return value ?? fallback;
}

function envInt(value: string | undefined, fallback: number): number {
  return Number(value ?? fallback);
}

function parseUiOrigins(raw: string | undefined): string[] {
  return envOr(raw, DEFAULT_UI_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function oauthClientConfig(clientId: string | undefined, clientSecret: string | undefined): OAuthClientConfig {
  return { clientId: envOr(clientId, ''), clientSecret: envOr(clientSecret, '') };
}

function s3ConfigFrom(env: NodeJS.ProcessEnv): AppConfig['s3'] {
  return {
    endpoint: env.S3_ENDPOINT,
    region: envOr(env.S3_REGION, 'us-east-1'),
    bucket: envOr(env.S3_BUCKET, 'war-media-dev'),
    accessKeyId: envOr(env.S3_ACCESS_KEY_ID, ''),
    secretAccessKey: envOr(env.S3_SECRET_ACCESS_KEY, ''),
    publicBaseUrl: envOr(env.S3_PUBLIC_BASE_URL, 'http://localhost:9000/war-media-dev'),
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = envInt(env.PORT, 3000);
  const apiBaseUrl = envOr(env.PUBLIC_BASE_URL, defaultPublicBaseUrl(port));

  return {
    port,
    databaseUrl: envOr(env.DATABASE_URL, ''),
    uiOrigins: parseUiOrigins(env.UI_ORIGINS),
    jwtSecret: envOr(env.JWT_SECRET, DEFAULT_JWT_SECRET),
    jwtIssuer: envOr(env.JWT_ISSUER, 'war-api'),
    apiBaseUrl,
    oauthProviders: {
      google: oauthClientConfig(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
      microsoft: oauthClientConfig(env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET),
      facebook: oauthClientConfig(env.FACEBOOK_CLIENT_ID, env.FACEBOOK_CLIENT_SECRET),
      twitter: oauthClientConfig(env.TWITTER_CLIENT_ID, env.TWITTER_CLIENT_SECRET),
    },
    internalTaskToken: envOr(env.INTERNAL_TASK_TOKEN, DEFAULT_INTERNAL_TASK_TOKEN),
    s3: s3ConfigFrom(env),
  };
}

/** True when `value` parses as an absolute `http:`/`https:` URL. */
function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** One PRODUCTION_RULES entry per OAuth provider — one call per provider below. */
function oauthProviderRule(
  envPrefix: string,
  get: (config: AppConfig) => OAuthClientConfig,
): { failsWhen: (config: AppConfig) => boolean; problem: string } {
  return {
    failsWhen: (config) => !get(config).clientId || !get(config).clientSecret,
    problem: `${envPrefix}_CLIENT_ID and ${envPrefix}_CLIENT_SECRET must be set`,
  };
}

/**
 * Each production-readiness rule as data rather than an inline `if`, so
 * adding a rule (as this file has already had to do twice) means adding an
 * array entry, not editing a function body (Open/Closed).
 */
const PRODUCTION_RULES: ReadonlyArray<{ failsWhen: (config: AppConfig) => boolean; problem: string }> = [
  {
    failsWhen: (config) => !config.jwtSecret || config.jwtSecret === DEFAULT_JWT_SECRET,
    problem: 'JWT_SECRET must be set to a non-default value',
  },
  {
    failsWhen: (config) => !config.internalTaskToken || config.internalTaskToken === DEFAULT_INTERNAL_TASK_TOKEN,
    problem: 'INTERNAL_TASK_TOKEN must be set to a non-default value',
  },
  {
    failsWhen: (config) => !config.databaseUrl,
    problem: 'DATABASE_URL must be set',
  },
  oauthProviderRule('GOOGLE', (config) => config.oauthProviders.google),
  oauthProviderRule('MICROSOFT', (config) => config.oauthProviders.microsoft),
  oauthProviderRule('FACEBOOK', (config) => config.oauthProviders.facebook),
  oauthProviderRule('TWITTER', (config) => config.oauthProviders.twitter),
  {
    failsWhen: (config) => !config.apiBaseUrl || config.apiBaseUrl === defaultPublicBaseUrl(config.port),
    problem: 'PUBLIC_BASE_URL must be set to a non-default value',
  },
  {
    // Only judges shape once a real (non-empty) value is present -- the rule
    // above already owns "missing entirely", so this stays a single concern:
    // a present PUBLIC_BASE_URL whose shape would break the derived
    // per-provider callback redirect_uri (e.g. a trailing slash doubling the
    // `/` before `api/v1/...`, which a provider's exact redirect_uri match
    // rejects outright).
    failsWhen: (config) =>
      config.apiBaseUrl !== '' && (config.apiBaseUrl.endsWith('/') || !isAbsoluteHttpUrl(config.apiBaseUrl)),
    problem: 'PUBLIC_BASE_URL must not end with a trailing slash and must be an absolute http(s) URL',
  },
  {
    failsWhen: (config) =>
      config.uiOrigins.length === 0 ||
      (config.uiOrigins.length === 1 && config.uiOrigins[0] === DEFAULT_UI_ORIGIN),
    problem: 'UI_ORIGINS must be set to a non-default value',
  },
];

/**
 * Refuses to let a real deployment boot with a secret left at its test
 * default, or with a required credential unset entirely (spec: a
 * misconfigured deployment must fail loudly, not serve traffic with auth
 * effectively disabled). `loadConfig` itself stays permissive so it remains
 * convenient for tests; only the real process entry point calls this.
 */
export function assertProductionConfig(config: AppConfig): void {
  const problems = PRODUCTION_RULES.filter((rule) => rule.failsWhen(config)).map((rule) => rule.problem);

  if (problems.length > 0) {
    throw new Error(`Refusing to start with an invalid production configuration: ${problems.join('; ')}`);
  }
}
