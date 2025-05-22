import axios, {
  AxiosError,
  AxiosHeaders,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

// Import types
import { LoggerInterface, RetryConfig, RetryContext, RobustAxiosConfig } from '../types';

// Import error classes
import {
  CancellationError,
  ClientError,
  HttpError,
  NetworkError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
} from '../errors';

// Import utilities
import { CircuitBreaker } from '../utils/circuit-breaker';
import { TokenBucketRateLimiter } from '../utils/rate-limiter';
import { ConsoleLogger } from '../utils/logger';
import { LRUCache } from '../utils/lru-cache';

// Import constants
import { DEFAULT_RETRY_CONFIG } from '../constants';

// Custom type guard for AxiosError
function isAxiosError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error);
}

export class RobustAxiosClient {
  //--------------------------------------------------------------------------
  // Private Properties
  //--------------------------------------------------------------------------
  private axiosInstance: AxiosInstance;
  private logger: LoggerInterface;
  private dryRun: boolean;
  private debug: boolean;
  private customErrorHandler?: (error: unknown) => Error;
  private retryConfig: Required<RetryConfig>;
  private circuitBreaker?: CircuitBreaker;
  private rateLimiter?: TokenBucketRateLimiter;
  private retryContexts: LRUCache<string, RetryContext>;
  private readonly contextMaxAge: number = 3600000;
  private readonly contextThreshold: number = 100; // Default to 100 contexts

  //--------------------------------------------------------------------------
  // Lifecycle Methods
  //--------------------------------------------------------------------------
  constructor(config: RobustAxiosConfig) {
    this.axiosInstance = axios.create(config);
    this.logger = config.logger ?? new ConsoleLogger();
    this.dryRun = config.dryRun ?? false;
    this.debug = config.debug ?? false;
    this.customErrorHandler = config.customErrorHandler;

    // Allow overriding the context max age
    if (config.contextMaxAge !== undefined) {
      this.contextMaxAge = config.contextMaxAge;
    }

    if (config.contextThreshold !== undefined) {
      this.contextThreshold = config.contextThreshold;
    }

    // Initialize the LRU cache for retry contexts
    this.retryContexts = new LRUCache<string, RetryContext>(this.contextThreshold);

    // Initialize retry configuration with defaults
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...config.retry,
    };

    // Initialize circuit breaker if enabled
    if (this.retryConfig.circuitBreaker) {
      this.circuitBreaker = new CircuitBreaker(
        this.retryConfig.circuitBreaker,
        this.retryConfig.onCircuitBreakerStateChange
      );
    }

    // Initialize rate limiter if configured
    if (config.rateLimit) {
      this.rateLimiter = new TokenBucketRateLimiter(
        config.rateLimit.maxRequests,
        config.rateLimit.windowMs
      );
      this.logger.debug('Rate limiter initialized', config.rateLimit);
    }

    this.setupInterceptors();
  }

  public destroy(): void {
    this.retryContexts.clear();
  }

  //--------------------------------------------------------------------------
  // Primary Public API Methods
  //--------------------------------------------------------------------------
  public getInstance(): AxiosInstance {
    return this.axiosInstance;
  }

  public getUri(config?: AxiosRequestConfig): string {
    return this.axiosInstance.getUri(config);
  }

  public async request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    if (this.dryRun) {
      this.logger.info('Dry run request:', config);
      return Promise.resolve({
        data: {} as T,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders({
          'content-type': 'application/json',
        }),
        config: {
          headers: new AxiosHeaders({ 'content-type': 'application/json' }),
        },
      });
    }

    return this.axiosInstance.request<T>(config);
  }

  // HTTP method wrappers
  public async get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  public async delete<T = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  public async head<T = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'HEAD', url });
  }

  public async options<T = unknown>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'OPTIONS', url });
  }

  public async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  public async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  public async patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PATCH', url, data });
  }

  //--------------------------------------------------------------------------
  // Configuration Methods
  //--------------------------------------------------------------------------
  public setDefaultHeader(key: string, value: string): void {
    this.axiosInstance.defaults.headers.common[key] = value;
  }

  public updateConfig(newConfig: AxiosRequestConfig): void {
    Object.assign(this.axiosInstance.defaults, newConfig);
  }

  //--------------------------------------------------------------------------
  // Interceptor Management
  //--------------------------------------------------------------------------
  public addRequestInterceptor(
    onFulfilled: (
      config: InternalAxiosRequestConfig
    ) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>,
    onRejected?: (error: unknown) => unknown
  ): number {
    return this.axiosInstance.interceptors.request.use(onFulfilled, onRejected);
  }

  public addResponseInterceptor(
    onFulfilled: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>,
    onRejected?: (error: unknown) => unknown
  ): number {
    return this.axiosInstance.interceptors.response.use(onFulfilled, onRejected);
  }

  public removeRequestInterceptor(interceptorId: number): void {
    this.axiosInstance.interceptors.request.eject(interceptorId);
  }

  public removeResponseInterceptor(interceptorId: number): void {
    this.axiosInstance.interceptors.response.eject(interceptorId);
  }

  //--------------------------------------------------------------------------
  // Private Implementation Methods
  //--------------------------------------------------------------------------
  private setupInterceptors(): void {
    this.setupRequestInterceptor();
    this.setupResponseInterceptor();
  }

  private setupRequestInterceptor(): void {
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        return this.handleRequestInterception(config);
      },
      (error) => {
        this.logger.error('Request Error:', error);
        return Promise.reject(error);
      }
    );
  }

  private async handleRequestInterception(
    config: InternalAxiosRequestConfig
  ): Promise<InternalAxiosRequestConfig> {
    // Check circuit breaker state
    if (this.circuitBreaker && !(await this.circuitBreaker.beforeRequest())) {
      throw new Error('Circuit breaker is open');
    }

    // Check rate limiter
    if (this.rateLimiter && !(await this.rateLimiter.tryAcquire())) {
      this.logger.warn('Rate limit exceeded, request rejected');
      throw new RateLimitError('Rate limit exceeded');
    }

    // Track request for retry context
    const requestId = this.generateRequestId(config);
    this.retryContexts.set(requestId, {
      retryCount: 0,
      startTime: Date.now(),
      attempts: [],
      requestConfig: config,
      category: this.determineRequestCategory(config),
    });

    // Cleanup old contexts based on age
    this.cleanupRetryContexts();

    this.logRequest(config);
    return config;
  }

  private setupResponseInterceptor(): void {
    this.axiosInstance.interceptors.response.use(
      (response) => {
        return this.handleSuccessResponse(response);
      },
      async (error: unknown) => {
        return this.handleErrorResponse(error);
      }
    );
  }

  private handleSuccessResponse(response: AxiosResponse): AxiosResponse {
    // Record successful response
    const context = this.getRetryContext(response.config);
    this.logResponse(response);

    if (this.circuitBreaker) {
      this.circuitBreaker.recordSuccess();
    }

    if (context) {
      this.retryConfig.onSuccess?.(response, context);
      // Clean up the context on success
      this.removeRetryContext(response.config);
    }

    return response;
  }

  private async handleErrorResponse(error: unknown): Promise<AxiosResponse> {
    this.logger.error('Response Error:', error);

    // Check for cancellation
    if (axios.isCancel(error)) {
      const axiosError = error as { config?: AxiosRequestConfig };
      this.logger.info('Request was cancelled', { url: axiosError.config?.url });
      // Clean up the context if it exists
      if (axiosError.config) {
        this.removeRetryContext(axiosError.config);
      }
      return Promise.reject(new CancellationError('Request was cancelled'));
    }

    // Ensure error is an AxiosError before proceeding
    if (!isAxiosError(error)) {
      return Promise.reject(
        this.handleError(error instanceof Error ? error : new Error(String(error)))
      );
    }

    if (!error.config) {
      return Promise.reject(this.handleError(error));
    }

    const context = this.getRetryContext(error.config);

    if (!context) {
      return Promise.reject(this.handleError(error));
    }

    // Record attempt
    context.attempts.push({
      timestamp: Date.now(),
      error,
      duration: Date.now() - context.startTime,
    });

    // Determine if we should retry
    if (await this.shouldRetry(error, context)) {
      return this.performRetry(error, context);
    }

    // No more retries, record failure
    if (this.circuitBreaker) {
      this.circuitBreaker.recordFailure();
    }

    this.retryConfig.onFailed?.(error, context);
    // Clean up the context after we're done with it
    this.removeRetryContext(error.config);
    return Promise.reject(this.handleError(error));
  }

  private async shouldRetry(error: AxiosError, context: RetryContext): Promise<boolean> {
    const categorySettings = this.getCategorySettings(context.category);
    const maxRetries = categorySettings?.maxRetries ?? this.retryConfig.maxRetries;
    const retryCondition = categorySettings?.retryCondition ?? this.retryConfig.retryCondition;

    // Make sure we don't exceed max retries
    if (context.retryCount >= maxRetries) {
      return false;
    }

    // Run the retry condition check
    try {
      // Handle both synchronous and async conditions
      const shouldRetry = await Promise.resolve(retryCondition(error));
      return shouldRetry;
    } catch (conditionError) {
      // If the condition check fails, log it and don't retry
      this.logger.error('Error in retry condition check:', conditionError);
      return false;
    }
  }

  private async performRetry(error: AxiosError, context: RetryContext): Promise<AxiosResponse> {
    context.retryCount++;

    const delay = this.calculateRetryDelay(context, error);
    await this.retryConfig.onRetry?.(context);

    // Apply timeout strategy if configured
    if (error.config?.timeout) {
      error.config.timeout = this.calculateNextTimeout(error.config.timeout, context.retryCount);
    }

    // Ensure config exists before proceeding
    if (!error.config) {
      throw new Error('Request configuration is missing for retry');
    }

    const config = error.config;

    // Check for cancellation before waiting
    const cancelToken = config.cancelToken;
    if (cancelToken?.reason) {
      this.removeRetryContext(config);
      throw new CancellationError('Request was cancelled during retry');
    }

    // Wait for the calculated delay
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        resolve();
      }, delay);

      // Handle cancellation during delay
      if (cancelToken) {
        cancelToken.promise
          .then(() => {
            clearTimeout(timeoutId);
            reject(new CancellationError('Request was cancelled during retry delay'));
          })
          .catch(() => {
            // Ignore errors in the cancellation promise
          });
      }
    });

    // Check again for cancellation after waiting
    if (cancelToken?.reason) {
      this.removeRetryContext(config);
      throw new CancellationError('Request was cancelled after retry delay');
    }

    // Perform the retry
    return this.axiosInstance(config);
  }

  //--------------------------------------------------------------------------
  // Retry and Backoff Strategy Methods
  //--------------------------------------------------------------------------
  private calculateRetryDelay(context: RetryContext, error: AxiosError): number {
    const categorySettings = this.getCategorySettings(context.category);
    const backoffStrategy = categorySettings?.backoffStrategy ?? this.retryConfig.backoffStrategy;
    const customBackoff = categorySettings?.customBackoff ?? this.retryConfig.customBackoff;

    switch (backoffStrategy) {
      case 'exponential':
        return Math.pow(2, context.retryCount) * 1000;
      case 'linear':
        return context.retryCount * 1000;
      case 'fibonacci':
        return this.calculateFibonacciDelay(context.retryCount);
      case 'custom': {
        return customBackoff(context.retryCount, error);
      }
      default:
        return 1000;
    }
  }

  private calculateFibonacciDelay(n: number): number {
    // Calculates the nth Fibonacci number and returns it multiplied by 1000 (for milliseconds).
    // n represents the current retry attempt number (e.g., 1 for the first retry, 2 for the second).
    // The Fibonacci sequence used here starts F(1)=1, F(2)=1, F(3)=2, F(4)=3, F(5)=5, etc.
    // (Note: some definitions start F(0)=0, F(1)=1, F(2)=1... this implementation aligns with n=retryCount directly)
    // So, for n=1 (1st retry), delay is F(1)*1000ms = 1000ms.
    // For n=2 (2nd retry), delay is F(2)*1000ms = 1000ms.
    // For n=3 (3rd retry), delay is F(3)*1000ms = 2000ms.

    // Use an iterative approach instead of recursive to avoid exponential complexity
    if (n <= 0) return 0; // No delay for n=0 or less (should not happen if n is retryCount)
    if (n === 1) return 1000; // 1 second for the first retry (F(1))

    // Initialize Fibonacci sequence state for iterative calculation.
    // prev corresponds to F(i-2), current corresponds to F(i-1) when calculating F(i).
    // For the first iteration (i=2, calculating F(2)):
    // prev = F(0) in a sequence where F(0)=0, F(1)=1.
    // current = F(1) in that same sequence.
    let prev = 0; // Represents F(0) if sequence is 0, 1, 1, 2, 3...
    let current = 1; // Represents F(1)

    // Loop starts from i=2 because F(0) and F(1) are base cases or handled by n=1 check.
    // Iteratively calculate F(i) up to F(n).
    // Example for n=2 (2nd retry, expecting F(2)=1):
    // i=2: next = prev(0) + current(1) = 1. prev becomes 1, current becomes 1. Loop ends. Returns 1 * 1000.
    // Example for n=3 (3rd retry, expecting F(3)=2):
    // i=2: next = prev(0) + current(1) = 1. prev becomes 1, current becomes 1.
    // i=3: next = prev(1) + current(1) = 2. prev becomes 1, current becomes 2. Loop ends. Returns 2 * 1000.
    for (let i = 2; i <= n; i++) {
      const next = prev + current;
      prev = current;
      current = next;
    }

    // Return delay in milliseconds
    return current * 1000;
  }

  private calculateNextTimeout(currentTimeout: number, retryCount: number): number {
    switch (this.retryConfig.timeoutStrategy) {
      case 'reset':
        return currentTimeout;
      case 'decay':
        return currentTimeout * Math.pow(this.retryConfig.timeoutMultiplier, retryCount);
      case 'fixed':
        return currentTimeout;
      default:
        return currentTimeout;
    }
  }

  //--------------------------------------------------------------------------
  // Error Handling Methods
  //--------------------------------------------------------------------------
  private handleError(error: AxiosError | Error): Error {
    let processedError: Error = error; // Start with the original error

    if (this.customErrorHandler) {
      const customHandlerResult = this.customErrorHandler(error);
      if (customHandlerResult instanceof Error) {
        processedError = customHandlerResult; // Use error returned by custom handler
      }
      // If customErrorHandler doesn't return an Error, processedError remains the original error.
      // This allows customErrorHandler to simply log, or modify the error object by reference (if it chooses to).
    }

    // Now, proceed with the library's classification logic using processedError
    if (
      processedError instanceof RateLimitError ||
      processedError instanceof CancellationError ||
      processedError instanceof TimeoutError ||
      processedError instanceof ValidationError
    ) {
      return processedError; // Already a specific library error, or one returned by custom handler
    }

    if (isAxiosError(processedError)) { // Make sure to use isAxiosError with processedError
      const axiosError = processedError as AxiosError; // Type assertion after check

      // Handle network errors (no response)
      if (!axiosError.response) {
        // Specific timeout error cases
        if (axiosError.code === 'ECONNABORTED') {
          return new TimeoutError(
            `Request timed out after ${axiosError.config?.timeout || 'unknown'}ms`
          );
        }

        if (axiosError.code === 'ETIMEDOUT') {
          return new TimeoutError('Connection timed out while waiting for response');
        }

        if (axiosError.code === 'ECONNREFUSED') {
          return new NetworkError(
            `Connection refused to ${axiosError.config?.url || 'unknown endpoint'}`,
            axiosError
          );
        }

        if (axiosError.code === 'ENOTFOUND') {
          return new NetworkError(
            `Host not found: ${axiosError.config?.url ? new URL(axiosError.config.url).hostname : 'unknown host'}`,
            axiosError
          );
        }

        if (axiosError.code === 'CERT_HAS_EXPIRED') {
          return new NetworkError('SSL certificate has expired', axiosError);
        }

        if (axiosError.message.includes('Network Error')) {
          return new NetworkError('Network connectivity issue detected', axiosError);
        }

        return new NetworkError(`Network error occurred: ${axiosError.message}`, axiosError);
      }

      // Handle response errors
      const status = axiosError.response.status;

      // Client errors (4xx)
      if (status >= 400 && status < 500) {
        if (status === 429) {
          // Try to get retry-after header for more specific message
          const retryAfter = axiosError.response.headers['retry-after'];
          if (retryAfter) {
            return new RateLimitError(`Rate limit exceeded. Retry after ${retryAfter} seconds`);
          }
          return new RateLimitError('Rate limit exceeded');
        }

        if (status === 422) {
          // Add validation details if available
          try {
            // Safely access potential validation details in response data
            const data = axiosError.response.data as Record<string, unknown>;
            const validationDetails = data['errors'] || data['details'];
            if (validationDetails) {
              return new ValidationError(`Validation failed: ${JSON.stringify(validationDetails)}`);
            }
          } catch (e) {
            // Ignore JSON parsing errors
          }
          return new ValidationError(axiosError.message);
        }

        if (status === 401) {
          return new ClientError('Authentication required', status, axiosError.response);
        }

        if (status === 403) {
          return new ClientError('Permission denied', status, axiosError.response);
        }

        if (status === 404) {
          return new ClientError(
            `Resource not found: ${axiosError.config?.url || 'unknown'}`,
            status,
            axiosError.response
          );
        }

        return new ClientError(axiosError.message || `Client error (${status})`, status, axiosError.response);
      }

      // Server errors (5xx)
      if (status >= 500) {
        return new ServerError(axiosError.message || `Server error (${status})`, status, axiosError.response);
      }

      // Fallback to generic HTTP error
      return new HttpError(axiosError.message, status, axiosError.response);
    }

    // Handle non-Axios errors with more context
    if (processedError instanceof Error) { // Check processedError here
      if (processedError.message.includes('timeout')) {
        return new TimeoutError(`Operation timed out: ${processedError.message}`);
      }

      if (processedError.message.includes('network') || processedError.message.includes('connection')) {
        return new NetworkError(`Network issue: ${processedError.message}`, processedError);
      }
    }

    // Unknown error type - return the processedError
    return processedError;
  }

  //--------------------------------------------------------------------------
  // Logging Methods
  //--------------------------------------------------------------------------
  private sanitizeRequest(config: AxiosRequestConfig): Record<string, unknown> {
    const safeConfig = { ...config };
    if (safeConfig.headers && typeof safeConfig.headers === 'object') {
      const headers = safeConfig.headers as Record<string, unknown>;
      if (headers['Authorization']) {
        safeConfig.headers = {
          ...safeConfig.headers,
          Authorization: '***',
        };
      }
    }
    return safeConfig;
  }

  private logRequest(config: AxiosRequestConfig): void {
    const safeConfig = this.sanitizeRequest(config);
    const message: Record<string, unknown> = {
      baseURL: config.baseURL,
      method: config.method,
      url: config.url,
    };

    this.logger.info('Request:', message);

    if (this.debug) {
      Object.assign(message, {
        headers: safeConfig['headers'],
        data: config.data,
      });
      this.logger.debug('Request:', message);
    }
  }

  private logResponse(response: AxiosResponse): void {
    const message: Record<string, unknown> = {
      baseURL: response.config.baseURL,
      status: response.status,
    };

    this.logger.info('Response:', message);

    if (this.debug) {
      Object.assign(message, {
        headers: response.headers,
        data: response.data,
      });
      this.logger.debug('Response:', message);
    }
  }

  //--------------------------------------------------------------------------
  // Context Management Methods
  //--------------------------------------------------------------------------
  private generateRequestId(config: AxiosRequestConfig): string {
    if (!config) {
      // Fallback for cases where config might be missing, though ideally this shouldn't happen in normal flow
      return `UNKNOWN_NO_CONFIG::${Date.now()}`;
    }

    const method = config.method?.toUpperCase() || 'UNKNOWN';
    const baseUrl = config.baseURL?.replace(/\/+$/, '') || ''; // Remove trailing slashes
    const path = config.url?.replace(/^\/+/, '') || ''; // Remove leading slashes
    
    // Ensure that baseUrl and path are not both empty, otherwise, it might result in just "https:///"
    let fullUri = 'unknown_uri';
    if (baseUrl && path) {
        fullUri = `${baseUrl}/${path}`;
    } else if (baseUrl) {
        fullUri = baseUrl;
    } else if (path) {
        fullUri = path;
    }


    let paramsString = '[NO_PARAMS]';
    if (config.params) {
      try {
        // Sort keys for consistent order
        const sortedParams: Record<string, unknown> = {};
        Object.keys(config.params)
          .sort()
          .forEach((key) => {
            sortedParams[key] = config.params[key];
          });
        paramsString = JSON.stringify(sortedParams);
      } catch {
        paramsString = '[UNSTRINGIFIABLE_PARAMS]';
      }
    }

    let dataString = '[NO_DATA]';
    if (config.data) {
      if (typeof config.data === 'string') {
        dataString = config.data;
      } else if (
        typeof config.data === 'object' &&
        config.data !== null &&
        !(config.data instanceof FormData) &&
        !(config.data instanceof Blob) &&
        !(typeof ReadableStream !== 'undefined' && config.data instanceof ReadableStream)
      ) {
        try {
          // Sort keys for consistent order if it's a plain object
          const sortedData: Record<string, unknown> = {};
          Object.keys(config.data)
            .sort()
            .forEach((key) => {
              sortedData[key] = config.data[key];
            });
          dataString = JSON.stringify(sortedData);
        } catch {
          dataString = '[UNSTRINGIFIABLE_DATA]';
        }
      } else {
        dataString = '[NON_PLAIN_OBJECT_DATA]';
      }
    }

    // Truncate dataString if too long to prevent excessively long keys
    if (dataString.length > 256) {
      dataString = dataString.substring(0, 256) + '[TRUNCATED]';
    }

    return `${method}::${fullUri}::${paramsString}::${dataString}`;
  }

  private getRetryContext(config?: AxiosRequestConfig): RetryContext | undefined {
    if (!config) return undefined;

    // Generate the request ID using the new deterministic logic
    const requestId = this.generateRequestId(config);

    // Perform a direct lookup using the generated ID
    // The LRU cache's get method typically handles marking the item as recently used.
    return this.retryContexts.get(requestId);
  }

  private removeRetryContext(config?: AxiosRequestConfig): void {
    if (!config) return;
    const requestId = this.generateRequestId(config);
    this.retryContexts.delete(requestId);
  }

  private cleanupRetryContexts(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Find contexts that have exceeded their age limit
    this.retryContexts.forEach((context, key) => {
      if (now - context.startTime > this.contextMaxAge) {
        expiredKeys.push(key);
      }
    });

    // Delete expired keys
    expiredKeys.forEach((key) => {
      this.retryContexts.delete(key);
    });

    // LRU cache already manages size limits

    if (expiredKeys.length > 0) {
      this.logger.debug(`Cleaned up ${expiredKeys.length} expired contexts`);
    }
  }

  //--------------------------------------------------------------------------
  // Request Categorization Methods
  //--------------------------------------------------------------------------
  private determineRequestCategory(config: AxiosRequestConfig): string | undefined {
    for (const [category, categoryConfig] of Object.entries(this.retryConfig.requestCategories)) {
      if (categoryConfig.matcher(config)) {
        return category;
      }
    }
    return undefined;
  }

  private getCategorySettings(category: string | undefined): Partial<RetryConfig> | undefined {
    if (!category) return undefined;
    return this.retryConfig.requestCategories[category]?.settings;
  }
}
