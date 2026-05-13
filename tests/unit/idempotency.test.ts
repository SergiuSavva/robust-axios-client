import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { isRetrySafe } from '../../src/utils/idempotency';
import { DEFAULT_RETRY_CONFIG } from '../../src/constants';

const makeConfig = (overrides: Partial<InternalAxiosRequestConfig> = {}) =>
  ({ method: 'GET', headers: new AxiosHeaders(), ...overrides } as InternalAxiosRequestConfig);

const makeError = (status: number | undefined, method: string, headers: Record<string, string> = {}, code?: string): AxiosError => {
  const config = makeConfig({ method, headers: new AxiosHeaders(headers) });
  return {
    isAxiosError: true,
    config,
    code,
    response: status !== undefined ? { status, data: {}, statusText: '', headers: {}, config } as never : undefined,
    name: 'AxiosError',
    message: 'test',
    toJSON: () => ({}),
  } as AxiosError;
};

describe('isRetrySafe()', () => {
  it.each(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'get', 'head'])(
    'considers %s intrinsically idempotent',
    (method) => {
      expect(isRetrySafe(makeConfig({ method }))).toBe(true);
    }
  );

  it.each(['POST', 'PATCH'])('considers %s non-idempotent by default', (method) => {
    expect(isRetrySafe(makeConfig({ method }))).toBe(false);
  });

  it('treats POST/PATCH with Idempotency-Key as safe (AxiosHeaders form)', () => {
    const headers = new AxiosHeaders({ 'Idempotency-Key': 'abc-123' });
    expect(isRetrySafe(makeConfig({ method: 'POST', headers }))).toBe(true);
    expect(isRetrySafe(makeConfig({ method: 'PATCH', headers }))).toBe(true);
  });

  it('treats POST with Idempotency-Key as safe (plain-object headers form)', () => {
    const config = makeConfig({
      method: 'POST',
      headers: { 'idempotency-key': 'abc-123' } as never,
    });
    expect(isRetrySafe(config)).toBe(true);
  });

  it('matches the Idempotency-Key header case-insensitively', () => {
    expect(
      isRetrySafe(makeConfig({ method: 'POST', headers: new AxiosHeaders({ 'IDEMPOTENCY-KEY': 'x' }) }))
    ).toBe(true);
  });

  it('rejects empty / nullish Idempotency-Key values', () => {
    const config = makeConfig({
      method: 'POST',
      headers: { 'idempotency-key': '' } as never,
    });
    expect(isRetrySafe(config)).toBe(false);
  });

  it('returns false for undefined config', () => {
    expect(isRetrySafe(undefined)).toBe(false);
  });
});

describe('DEFAULT_RETRY_CONFIG.retryCondition', () => {
  const cond = DEFAULT_RETRY_CONFIG.retryCondition;

  it('always retries 429 regardless of method (rate limiter never processed the request)', async () => {
    expect(await cond(makeError(429, 'POST'))).toBe(true);
    expect(await cond(makeError(429, 'PATCH'))).toBe(true);
    expect(await cond(makeError(429, 'GET'))).toBe(true);
  });

  it('retries 5xx on idempotent methods', async () => {
    expect(await cond(makeError(500, 'GET'))).toBe(true);
    expect(await cond(makeError(503, 'PUT'))).toBe(true);
    expect(await cond(makeError(502, 'DELETE'))).toBe(true);
  });

  it('does NOT retry 5xx on POST/PATCH without Idempotency-Key', async () => {
    expect(await cond(makeError(500, 'POST'))).toBe(false);
    expect(await cond(makeError(503, 'PATCH'))).toBe(false);
  });

  it('retries 5xx on POST when Idempotency-Key is present', async () => {
    expect(await cond(makeError(500, 'POST', { 'idempotency-key': 'k1' }))).toBe(true);
  });

  it('retries network errors (no response) on idempotent methods', async () => {
    expect(await cond(makeError(undefined, 'GET'))).toBe(true);
  });

  it('does NOT retry network errors on POST without Idempotency-Key', async () => {
    expect(await cond(makeError(undefined, 'POST'))).toBe(false);
  });

  it('does NOT retry timeouts (ECONNABORTED) on POST without Idempotency-Key', async () => {
    expect(await cond(makeError(undefined, 'POST', {}, 'ECONNABORTED'))).toBe(false);
  });

  it('retries timeouts on idempotent methods', async () => {
    expect(await cond(makeError(undefined, 'GET', {}, 'ECONNABORTED'))).toBe(true);
  });

  it('does not retry 4xx (other than 429)', async () => {
    expect(await cond(makeError(400, 'GET'))).toBe(false);
    expect(await cond(makeError(404, 'GET'))).toBe(false);
    expect(await cond(makeError(422, 'GET'))).toBe(false);
  });
});
