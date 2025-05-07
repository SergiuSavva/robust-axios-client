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
export { DEFAULT_RETRY_CONFIG } from './constants';

// Create and export RobustAxios as the default export (for backward compatibility)
const RobustAxios = RobustAxiosFactory;

// Initialize default instance (don't need to store reference as it's managed by the factory)
RobustAxiosFactory.getDefaultInstance();

// Export default instance and factory
export default RobustAxios;
