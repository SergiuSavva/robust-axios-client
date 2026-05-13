import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { RobustAxiosClient } from '../../src/core/RobustAxiosClient';
import { RetryContext } from '../../src/types';

// We exercise the private `calculateRetryDelay` via a thin test subclass
// that exposes it. The behavior under test is policy, not state, so this
// is the cleanest way to assert it without rebuilding a whole request.
class TestableClient extends RobustAxiosClient {
  callCalculate(context: RetryContext, error: AxiosError): number {
    return (this as any).calculateRetryDelay(context, error);
  }
  callParse(value: unknown): number | null {
    return (this as any).parseRetryAfter(value);
  }
}

const makeError = (
  status: number | undefined,
  headers: Record<string, string> = {}
): AxiosError => {
  const cfg = { method: 'GET', headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  return {
    isAxiosError: true,
    config: cfg,
    response:
      status !== undefined
        ? ({ status, headers, data: {}, statusText: '', config: cfg } as never)
        : undefined,
    name: 'AxiosError',
    message: 'test',
    toJSON: () => ({}),
  } as AxiosError;
};

const makeContext = (retryCount: number): RetryContext => ({
  retryCount,
  startTime: Date.now(),
  attempts: [],
  requestConfig: {},
});

describe('parseRetryAfter()', () => {
  let client: TestableClient;
  beforeEach(() => {
    client = new TestableClient({ baseURL: 'https://example.com' });
  });

  it('parses delta-seconds form', () => {
    expect(client.callParse('5')).toBe(5_000);
    expect(client.callParse('0')).toBe(0);
    expect(client.callParse('  120  ')).toBe(120_000);
  });

  it('parses HTTP-date form', () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const parsed = client.callParse(future);
    expect(parsed).not.toBeNull();
    expect(parsed!).toBeGreaterThanOrEqual(9_000);
    expect(parsed!).toBeLessThanOrEqual(11_000);
  });

  it('clamps past HTTP-dates to zero (not negative)', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(client.callParse(past)).toBe(0);
  });

  it('returns null for missing, empty, or garbage values', () => {
    expect(client.callParse(undefined)).toBeNull();
    expect(client.callParse(null)).toBeNull();
    expect(client.callParse('')).toBeNull();
    expect(client.callParse('not a date')).toBeNull();
  });

  it('returns null for negative numeric values', () => {
    expect(client.callParse('-5')).toBeNull();
  });
});

describe('calculateRetryDelay()', () => {
  it('honors Retry-After regardless of backoff strategy', () => {
    const client = new TestableClient({
      baseURL: 'https://example.com',
      retry: { backoffStrategy: 'linear' },
    });
    const delay = client.callCalculate(makeContext(2), makeError(429, { 'retry-after': '7' }));
    expect(delay).toBe(7_000);
  });

  it('honors Retry-After on 5xx too, not just 429', () => {
    const client = new TestableClient({
      baseURL: 'https://example.com',
      retry: { backoffStrategy: 'exponential' },
    });
    const delay = client.callCalculate(makeContext(1), makeError(503, { 'retry-after': '3' }));
    expect(delay).toBe(3_000);
  });

  it('falls through to backoff strategy when Retry-After is absent', () => {
    const client = new TestableClient({
      baseURL: 'https://example.com',
      retry: { backoffStrategy: 'linear' },
    });
    const delay = client.callCalculate(makeContext(3), makeError(500));
    expect(delay).toBe(3_000); // 3 retries * 1000
  });

  it('applies equal jitter to exponential backoff', () => {
    const client = new TestableClient({
      baseURL: 'https://example.com',
      retry: { backoffStrategy: 'exponential' },
    });
    // n=3 -> base = 8000ms, jittered into [4000, 8000).
    const samples = Array.from({ length: 200 }, () =>
      client.callCalculate(makeContext(3), makeError(500))
    );
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(min).toBeGreaterThanOrEqual(4_000);
    expect(max).toBeLessThan(8_000);
    // With 200 samples the variance should be visible, not collapsed.
    expect(max - min).toBeGreaterThan(500);
  });

  it('does not jitter linear or fibonacci strategies (deterministic delay)', () => {
    const linear = new TestableClient({
      baseURL: 'https://example.com',
      retry: { backoffStrategy: 'linear' },
    });
    const fib = new TestableClient({
      baseURL: 'https://example.com',
      retry: { backoffStrategy: 'fibonacci' },
    });
    expect(linear.callCalculate(makeContext(2), makeError(500))).toBe(2_000);
    expect(linear.callCalculate(makeContext(2), makeError(500))).toBe(2_000);
    const f1 = fib.callCalculate(makeContext(5), makeError(500));
    const f2 = fib.callCalculate(makeContext(5), makeError(500));
    expect(f1).toBe(f2);
  });
});
