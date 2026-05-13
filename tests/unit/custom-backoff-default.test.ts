import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { RobustAxiosClient } from '../../src/core/RobustAxiosClient';
import { DEFAULT_RETRY_CONFIG } from '../../src/constants';
import { RetryContext } from '../../src/types';

class TestableClient extends RobustAxiosClient {
  callCalculate(context: RetryContext, error: AxiosError): number {
    return (this as any).calculateRetryDelay(context, error);
  }
}

const makeError = (): AxiosError => {
  const cfg = { method: 'GET', headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  return {
    isAxiosError: true,
    config: cfg,
    response: { status: 500, headers: {}, data: {}, statusText: '', config: cfg } as never,
    name: 'AxiosError',
    message: 'test',
    toJSON: () => ({}),
  } as AxiosError;
};

const makeContext = (n: number): RetryContext => ({
  retryCount: n,
  startTime: Date.now(),
  attempts: [],
  requestConfig: {},
});

describe("default customBackoff (sentinel for 'custom' without an override)", () => {
  it("throws a helpful error when backoffStrategy is 'custom' but customBackoff is not supplied", () => {
    const client = new TestableClient({
      baseURL: 'https://example.com',
      retry: { backoffStrategy: 'custom' },
    });
    expect(() => client.callCalculate(makeContext(1), makeError())).toThrow(
      /backoffStrategy is 'custom' but no customBackoff function was provided/
    );
  });

  it('invokes the user-provided customBackoff when supplied', () => {
    const customBackoff = jest.fn((retryCount: number) => retryCount * 250);
    const client = new TestableClient({
      baseURL: 'https://example.com',
      retry: { backoffStrategy: 'custom', customBackoff },
    });
    expect(client.callCalculate(makeContext(4), makeError())).toBe(1000);
    expect(customBackoff).toHaveBeenCalledWith(4, expect.any(Object));
  });

  it('is never consulted when backoffStrategy is a built-in (default behavior)', () => {
    // The default DEFAULT_RETRY_CONFIG.backoffStrategy is 'exponential',
    // so the default customBackoff (which throws) must not fire.
    const client = new TestableClient({ baseURL: 'https://example.com' });
    expect(() => client.callCalculate(makeContext(1), makeError())).not.toThrow();
  });

  it('the exported DEFAULT_RETRY_CONFIG keeps customBackoff as a throwing sentinel', () => {
    expect(() => DEFAULT_RETRY_CONFIG.customBackoff(1, makeError())).toThrow();
  });
});
