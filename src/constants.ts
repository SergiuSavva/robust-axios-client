import { RetryConfig } from './types';

// Default retry configuration
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  retryCondition: (error) => {
    return (
      !error.response ||
      error.response.status >= 500 ||
      error.response.status === 429 ||
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
