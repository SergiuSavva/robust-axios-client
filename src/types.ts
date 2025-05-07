import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

// Circuit breaker states
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// Retry context for better tracking and debugging
export interface RetryContext {
  retryCount: number;
  startTime: number;
  attempts: Array<{
    timestamp: number;
    error?: AxiosError;
    duration: number;
  }>;
  requestConfig: AxiosRequestConfig;
  category?: string;
}

// Logger interface
export interface LoggerInterface {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// Enhanced retry configuration interface
export interface RetryConfig {
  // Core retry settings
  maxRetries?: number;
  retryCondition?: (error: AxiosError) => boolean | Promise<boolean>;
  retryDelay?: (retryCount: number, error: AxiosError) => number;

  // Enhanced timeout handling
  timeoutStrategy?: 'reset' | 'decay' | 'fixed';
  timeoutMultiplier?: number;

  // Circuit breaker settings
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeout: number;
    halfOpenMaxRequests: number;
  };

  // Retry backoff strategies
  backoffStrategy?: 'exponential' | 'linear' | 'fibonacci' | 'custom';
  customBackoff?: (retryCount: number, error: AxiosError) => number;

  // Event hooks
  onRetry?: (retryContext: RetryContext) => Promise<void> | void;
  onSuccess?: (response: AxiosResponse, retryContext: RetryContext) => void;
  onFailed?: (error: AxiosError, retryContext: RetryContext) => void;
  onCircuitBreakerStateChange?: (newState: CircuitBreakerState) => void;

  // Request categorization
  requestCategories?: {
    [key: string]: {
      matcher: (config: AxiosRequestConfig) => boolean;
      settings?: Partial<RetryConfig>;
    };
  };
}

// Main config interface
export interface RobustAxiosConfig extends AxiosRequestConfig {
  retry?: RetryConfig;
  logger?: LoggerInterface;
  dryRun?: boolean;
  debug?: boolean;
  customErrorHandler?: (error: unknown) => Error;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  contextMaxAge?: number; // Maximum age for retry contexts in ms
  contextThreshold?: number; // Maximum number of contexts before cleanup
}
