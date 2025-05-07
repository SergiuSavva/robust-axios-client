// Re-export everything from the new structure for backward compatibility
import RobustAxios from './index';

export {
  CircuitBreakerState,
  ClientError,
  ConsoleLogger,
  HttpError,
  LoggerInterface,
  NetworkError,
  RateLimitError,
  RetryConfig,
  RetryContext,
  RobustAxiosClient,
  RobustAxiosConfig,
  ServerError,
  TimeoutError,
  ValidationError,
  CancellationError,
} from './index';

// Export as default
export default RobustAxios;
