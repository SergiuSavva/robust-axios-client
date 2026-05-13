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
  // 'grow' is the canonical name; 'decay' is kept as a deprecated
  // alias for backward compatibility.
  timeoutStrategy: 'grow',
  timeoutMultiplier: 1.5,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 60000,
    halfOpenMaxRequests: 3,
  },
  backoffStrategy: 'exponential',
  // Sentinel default: only consulted when the user picks
  // `backoffStrategy: 'custom'`. If they forgot to also supply their
  // own `customBackoff`, fail loudly rather than silently falling
  // back to a meaningless 1000ms-per-retry default.
  customBackoff: () => {
    throw new Error(
      "backoffStrategy is 'custom' but no customBackoff function was provided. " +
        'Pass `retry: { backoffStrategy: "custom", customBackoff: (retryCount, error) => ms }` ' +
        'or pick a built-in strategy ("exponential" | "linear" | "fibonacci").'
    );
  },
  onRetry: () => {},
  onSuccess: () => {},
  onFailed: () => {},
  onCircuitBreakerStateChange: () => {},
  requestCategories: {},
};
