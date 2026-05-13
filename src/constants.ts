import { RetryConfig } from './types';
import { isRetrySafe } from './utils/idempotency';

// Best-practice default request timeout. axios's own default is 0
// (infinite), which is the most common production footgun in axios
// usage. Users opt out by passing `timeout: 0` explicitly.
export const DEFAULT_TIMEOUT_MS = 30_000;

// Default retry configuration
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  retryCondition: (error) => {
    // Status 429 is always safe to retry -- the request was rejected
    // by the rate limiter before any work happened on the server.
    if (error.response?.status === 429) return true;

    // For everything else (5xx, timeouts, network errors), the server
    // may or may not have processed the request. Only retry if the
    // method is intrinsically idempotent or an Idempotency-Key was
    // sent. Otherwise the user is opting in to potential duplicates.
    if (!isRetrySafe(error.config)) return false;

    return (
      !error.response ||
      error.response.status >= 500 ||
      error.code === 'ECONNABORTED'
    );
  },
  retryDelay: (retryCount, error) => {
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      if (retryAfter) {
        return parseInt(String(retryAfter), 10) * 1000;
      }
    }
    return Math.pow(2, retryCount) * 1000;
  },
  timeoutStrategy: 'decay',
  timeoutMultiplier: 1.5,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 60000,
    halfOpenMaxRequests: 3,
  },
  backoffStrategy: 'exponential',
  customBackoff: (retryCount) => retryCount * 1000,
  onRetry: () => {},
  onSuccess: () => {},
  onFailed: () => {},
  onCircuitBreakerStateChange: () => {},
  requestCategories: {},
};
