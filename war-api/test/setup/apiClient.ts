import request from 'supertest';
import type { TestHarness } from './testApp.js';

/** The `INTERNAL_TASK_TOKEN` the test configuration (`testConfig()`) gives the app. */
export const INTERNAL_TOKEN = 'test-internal-token';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface CallOptions {
  body?: object;
  query?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  /** Escape hatch for supertest features the options do not cover, such as `.attach()`. */
  configure?: (req: request.Test) => request.Test;
}

export interface ApiClient {
  get(path: string, options?: CallOptions): Promise<request.Response>;
  post(path: string, options?: CallOptions | object): Promise<request.Response>;
  put(path: string, options?: CallOptions | object): Promise<request.Response>;
  patch(path: string, options?: CallOptions | object): Promise<request.Response>;
  delete(path: string, options?: CallOptions): Promise<request.Response>;
}

type Harness = Pick<TestHarness, 'app'>;

function isCallOptions(value: object): value is CallOptions {
  return 'body' in value || 'query' in value || 'headers' in value || 'configure' in value;
}

function toCallOptions(options?: CallOptions | object): CallOptions {
  if (options === undefined) return {};
  // A bare object is shorthand for { body }; an object with body/query/headers keys is the full form.
  return isCallOptions(options) ? options : { body: options };
}

function clientWith(harness: Harness, credentials: () => Promise<Record<string, string>>): ApiClient {
  const call = async (method: Method, path: string, options?: CallOptions | object): Promise<request.Response> => {
    const { body, query, headers, configure } = toCallOptions(options);
    await harness.app.ready();
    const allHeaders = { ...(await credentials()), ...headers };
    let req = request(harness.app.server)[method](path);
    for (const [name, value] of Object.entries(allHeaders)) {
      req = req.set(name, value);
    }
    req = (configure ?? ((r) => r))(req.query(query ?? {}));
    return body === undefined ? req : req.send(body);
  };

  return {
    get: (path, options) => call('get', path, options),
    post: (path, options) => call('post', path, options),
    put: (path, options) => call('put', path, options),
    patch: (path, options) => call('patch', path, options),
    delete: (path, options) => call('delete', path, options),
  };
}

/** Requests authenticated with a fresh access token for `voterId`. */
export function as(harness: Pick<TestHarness, 'app' | 'jwtFor'>, voterId: string): ApiClient {
  return clientWith(harness, async () => ({ Authorization: `Bearer ${await harness.jwtFor(voterId)}` }));
}

/** Requests that carry no credentials at all. */
export function anonymous(harness: Harness): ApiClient {
  return clientWith(harness, async () => ({}));
}

/** Authenticated as `voterId` when given, anonymous otherwise. */
export function asOrAnonymous(harness: Pick<TestHarness, 'app' | 'jwtFor'>, voterId?: string): ApiClient {
  return voterId ? as(harness, voterId) : anonymous(harness);
}

/** Requests authenticated the way the scheduler's internal tasks are. */
export function withInternalToken(harness: Harness, token: string = INTERNAL_TOKEN): ApiClient {
  return clientWith(harness, async () => ({ 'X-Internal-Token': token }));
}

export function putRole(harness: TestHarness, callerId: string, voterId: string, role: string, granted: boolean) {
  return as(harness, callerId).put(`/api/v1/voters/${voterId}/roles/${role}`, { granted });
}

export function getNextMatchup(harness: TestHarness, warId: string, voterId: string) {
  return as(harness, voterId).get(`/api/v1/wars/${warId}/matchups/next`);
}

export function postVote(harness: TestHarness, warId: string, matchupId: string, voterId: string, winnerId: string) {
  return as(harness, voterId).post(`/api/v1/wars/${warId}/matchups/${matchupId}/vote`, { winner_id: winnerId });
}

export function uploadImage(
  harness: TestHarness,
  warId: string,
  contestantId: string,
  voterId: string,
  buffer: Buffer,
  { filename = 'photo.jpg', contentType = 'image/jpeg' } = {},
) {
  return as(harness, voterId).post(`/api/v1/wars/${warId}/contestants/${contestantId}/images`, {
    configure: (req) => req.attach('file', buffer, { filename, contentType }),
  });
}

/** `GET /api/v1/wars` with a raw query string such as `?sort=newest`; anonymous unless `voterId` is given. */
export function getWars(harness: TestHarness, query = '', voterId?: string) {
  return asOrAnonymous(harness, voterId).get(`/api/v1/wars${query}`);
}

export function getMe(harness: TestHarness, voterId: string) {
  return as(harness, voterId).get('/api/v1/auth/me');
}

export function postWar(harness: TestHarness, callerId: string, body: object = { title: 'Test War' }) {
  return as(harness, callerId).post('/api/v1/wars', body);
}

export function getKillSwitch(harness: TestHarness, callerId: string) {
  return as(harness, callerId).get('/api/v1/kill-switch');
}

export function putKillSwitch(harness: TestHarness, callerId: string, body: object) {
  return as(harness, callerId).put('/api/v1/kill-switch', body);
}
