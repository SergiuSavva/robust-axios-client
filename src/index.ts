// Export client and factory classes
import { RobustAxiosFactory } from './core/RobustAxiosFactory';
export { RobustAxiosClient } from './core/RobustAxiosClient';

// Re-export types and utilities
export {
  CircuitBreakerState,
  LoggerInterface,
  RetryConfig,
  RetryContext,
  RobustAxiosConfig,
} from './types';

// Re-export error classes
export {
  CancellationError,
  ClientError,
  HttpError,
  NetworkError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
} from './errors';

// Re-export utilities
export { CircuitBreaker } from './utils/circuit-breaker';
export { TokenBucketRateLimiter } from './utils/rate-limiter';
export { ConsoleLogger } from './utils/logger';
export { LRUCache } from './utils/lru-cache';

// Export constants
export { DEFAULT_RETRY_CONFIG, DEFAULT_TIMEOUT_MS } from './constants';

// Default export. The factory's static HTTP methods (`RobustAxios.get(...)`
// etc.) lazily create the default instance on first call, so importing
// this module has no side effects -- which keeps `"sideEffects": false`
// honest and lets bundlers tree-shake the factory away for users who
// only need `RobustAxios.create(...)`.
const RobustAxios = RobustAxiosFactory;

export default RobustAxios;
