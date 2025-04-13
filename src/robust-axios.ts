import axios, {
  AxiosError,
  AxiosHeaders,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig
} from 'axios';

// Custom type guard for AxiosError
function isAxiosError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error);
}

// Circuit breaker states
type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// Retry context for better tracking and debugging
interface RetryContext {
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

// Error classes
export class HttpError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: AxiosResponse,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ServerError extends HttpError {
  constructor(
    message: string,
    statusCode: number,
    response?: AxiosResponse
  ) {
    super(message, statusCode, response);
    this.name = 'ServerError';
  }
}

export class ClientError extends HttpError {
  constructor(
    message: string,
    statusCode: number,
    response?: AxiosResponse
  ) {
    super(message, statusCode, response);
    this.name = 'ClientError';
  }
}

export class CancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancellationError';
  }
}

// Default logger implementation
export class ConsoleLogger implements LoggerInterface {
  debug(message: string, ...args: unknown[]): void {
    console.debug(message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    console.info(message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(message, ...args);
  }
}

// Circuit breaker implementation
class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failures: number = 0;
  private lastStateChange: number = Date.now();
  private requestCount: number = 0;

  constructor(
    private readonly config: Required<RetryConfig>['circuitBreaker'],
    private readonly onStateChange?: (state: CircuitBreakerState) => void
  ) {}

  async beforeRequest(): Promise<boolean> {
    switch (this.state) {
      case 'CLOSED':
        return true;
      case 'OPEN':
        if (Date.now() - this.lastStateChange >= this.config.resetTimeout) {
          this.transitionTo('HALF_OPEN');
          return true;
        }
        return false;
      case 'HALF_OPEN':
        return this.requestCount < this.config.halfOpenMaxRequests;
      default:
        return false;
    }
  }

  recordSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED');
    }
    this.failures = 0;
    this.requestCount = 0;
  }

  recordFailure() {
    this.failures++;
    if (this.failures >= this.config.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(newState: CircuitBreakerState) {
    this.state = newState;
    this.lastStateChange = Date.now();
    this.onStateChange?.(newState);
  }
}

// Rate limiter implementation
class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxTokens = maxRequests;
    this.tokens = maxRequests;
    this.lastRefill = Date.now();
    this.refillRate = maxRequests / windowMs;
  }

  async tryAcquire(): Promise<boolean> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    return false;
  }

  private refill() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const newTokens = timePassed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  retryCondition: (error: AxiosError) => {
    return (
      !error.response ||
      error.response.status >= 500 ||
      error.response.status === 429 ||
      error.code === 'ECONNABORTED'
    );
  },
  retryDelay: (retryCount: number, error: AxiosError) => {
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
    halfOpenMaxRequests: 3
  },
  backoffStrategy: 'exponential',
  customBackoff: (retryCount: number) => retryCount * 1000,
  onRetry: () => {},
  onSuccess: () => {},
  onFailed: () => {},
  onCircuitBreakerStateChange: () => {},
  requestCategories: {}
};

export class RobustAxios {
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
  private retryContexts: Map<string, RetryContext> = new Map();
  private readonly contextMaxAge: number = 3600000;
  private readonly contextThreshold: number = 100; // Default to 100 contexts

  // Static reference to default instance for testing/cleanup
  public static _defaultInstance: RobustAxios | null = null;

  //--------------------------------------------------------------------------
  // Static Methods
  //--------------------------------------------------------------------------
  public static create(config: RobustAxiosConfig): RobustAxios {
    return new RobustAxios(config);
  }

  // Method to reset all static instances for testing
  public static _resetForTesting(): void {
    if (RobustAxios._defaultInstance) {
      RobustAxios._defaultInstance.destroy();
      RobustAxios._defaultInstance = null;
    }
  }

  // Static methods that delegate to the default instance
  public static request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return defaultInstance.request<T>(config);
  }

  public static get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return defaultInstance.get<T>(url, config);
  }

  public static delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return defaultInstance.delete<T>(url, config);
  }

  public static head<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return defaultInstance.head<T>(url, config);
  }

  public static options<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return defaultInstance.options<T>(url, config);
  }

  public static post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return defaultInstance.post<T>(url, data, config);
  }

  public static put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return defaultInstance.put<T>(url, data, config);
  }

  public static patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return defaultInstance.patch<T>(url, data, config);
  }

  // Additional static methods
  public static all<T>(values: Array<T | Promise<T>>): Promise<T[]> {
    return axios.all(values);
  }

  public static spread<T, R>(callback: (...args: T[]) => R): (array: T[]) => R {
    return axios.spread(callback);
  }

  public static isCancel(value: unknown): boolean {
    return axios.isCancel(value);
  }

  public static isAxiosError(payload: unknown): payload is AxiosError {
    return axios.isAxiosError(payload);
  }

  public static CancelToken = axios.CancelToken;
  public static Cancel = axios.Cancel;

  public static getUri(config?: AxiosRequestConfig): string {
    return defaultInstance.getUri(config);
  }

  public static setDefaultHeader(key: string, value: string): void {
    return defaultInstance.setDefaultHeader(key, value);
  }

  public static updateConfig(newConfig: AxiosRequestConfig): void {
    return defaultInstance.updateConfig(newConfig);
  }

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

    // Initialize retry configuration with defaults
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...config.retry
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
  public async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  public async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  public async head<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'HEAD', url });
  }

  public async options<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'OPTIONS', url });
  }

  public async post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  public async put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  public async patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
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
    onFulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>,
    onRejected?: (error: unknown) => unknown,
  ): number {
    return this.axiosInstance.interceptors.request.use(onFulfilled, onRejected);
  }

  public addResponseInterceptor(
    onFulfilled: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>,
    onRejected?: (error: unknown) => unknown,
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
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      async (config) => {
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
          category: this.determineRequestCategory(config)
        });

        // Check if we need to clean up based on size threshold
        if (this.retryContexts.size > this.contextThreshold) {
          this.cleanupRetryContexts();
        }

        this.logRequest(config);
        return config;
      },
      (error) => {
        this.logger.error('Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => {
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
      },
      async (error: unknown) => {
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
          return Promise.reject(this.handleError(error instanceof Error ? error : new Error(String(error))));
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
          duration: Date.now() - context.startTime
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
    );
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
      error.config.timeout = this.calculateNextTimeout(
        error.config.timeout,
        context.retryCount
      );
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
        cancelToken.promise.then(() => {
          clearTimeout(timeoutId);
          reject(new CancellationError('Request was cancelled during retry delay'));
        }).catch(() => {
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
    const fibonacci = (num: number): number => {
      if (num <= 1) return num;
      return fibonacci(num - 1) + fibonacci(num - 2);
    };
    return fibonacci(n) * 1000;
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
    if (this.customErrorHandler) {
      return this.customErrorHandler(error);
    }

    // Handle specific error types
    if (error instanceof RateLimitError || 
        error instanceof CancellationError) {
      return error;
    }

    if (isAxiosError(error)) {
      // Handle network errors (no response)
      if (!error.response) {
        if (error.code === 'ECONNABORTED') {
          return new TimeoutError('Request timed out');
        }
        
        if (error.code === 'ECONNREFUSED') {
          return new NetworkError('Connection refused', error);
        }
        
        if (error.code === 'ENOTFOUND') {
          return new NetworkError('Host not found', error);
        }
        
        return new NetworkError('Network error occurred', error);
      }

      // Handle response errors
      const status = error.response.status;
      
      // Client errors (4xx)
      if (status >= 400 && status < 500) {
        if (status === 429) {
          return new RateLimitError('Rate limit exceeded');
        }
        
        if (status === 422) {
          return new ValidationError(error.message);
        }
        
        return new ClientError(error.message, status, error.response);
      }
      
      // Server errors (5xx)
      if (status >= 500) {
        return new ServerError(error.message, status, error.response);
      }
      
      // Fallback to generic HTTP error
      return new HttpError(error.message, status, error.response);
    }

    // Unknown error type
    return error;
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
      return `UNKNOWN-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    }

    // Extract components with proper fallbacks
    const method = config.method?.toUpperCase() || 'UNKNOWN';
    const baseUrl = config.baseURL?.replace(/\/+$/, '') || '';
    const path = config.url?.replace(/^\/+/, '') || 'unknown';
    
    // Normalize URL parts and combine them
    const fullUri = baseUrl ? `${baseUrl}/${path}` : path;
    
    // Include params hash if present (helps differentiate GET requests to same endpoint)
    let paramsComponent = '';
    if (config.params) {
      try {
        const paramsString = JSON.stringify(config.params);
        paramsComponent = `-${paramsString.length}-${paramsString.slice(0, 10).replace(/\W/g, '')}`;
      } catch {
        // Ignore if params cannot be stringified
      }
    }
    
    // Create a timestamp-based component for uniqueness
    const timestamp = Date.now().toString(36);
    const randomComponent = Math.random().toString(36).substring(2, 8);
    
    return `${method}-${fullUri}${paramsComponent}-${timestamp}${randomComponent}`;
  }

  private getRetryContext(config?: AxiosRequestConfig): RetryContext | undefined {
    if (!config) return undefined;
    
    // Try to find the context by exact ID
    const requestId = this.generateRequestId(config);
    const context = this.retryContexts.get(requestId);
    
    // If found, return it
    if (context) return context;
    
    // If not found by exact ID, look through all contexts
    // This helps in tests where mocks might create slightly different configs
    for (const ctx of this.retryContexts.values()) {
      if (ctx.requestConfig.method === config.method && 
          ctx.requestConfig.url === config.url) {
        return ctx;
      }
    }
    
    return undefined;
  }

  private removeRetryContext(config?: AxiosRequestConfig): void {
    if (!config) return;
    const requestId = this.generateRequestId(config);
    this.retryContexts.delete(requestId);
  }

  private cleanupRetryContexts(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Step 1: Remove contexts that are too old
    this.retryContexts.forEach((context, key) => {
      if (now - context.startTime > this.contextMaxAge) {
        expiredKeys.push(key);
      }
    });
    
    // Delete expired keys
    expiredKeys.forEach(key => {
      this.retryContexts.delete(key);
    });
    
    // Step 2: If still above threshold, use FIFO to remove oldest contexts
    if (this.retryContexts.size > this.contextThreshold) {
      // Get all contexts with their keys and sort by startTime (oldest first)
      const contextEntries = Array.from(this.retryContexts.entries())
        .map(([key, context]) => ({ key, startTime: context.startTime }))
        .sort((a, b) => a.startTime - b.startTime);
      
      // Calculate how many additional contexts we need to remove
      const extraToRemove = this.retryContexts.size - this.contextThreshold;
      
      if (extraToRemove > 0) {
        // Add the oldest keys to our expired keys list
        const oldestKeys = contextEntries.slice(0, extraToRemove).map(entry => entry.key);
        
        // Delete these oldest contexts
        oldestKeys.forEach(key => {
          this.retryContexts.delete(key);
        });
        
        this.logger.debug(`FIFO cleanup removing ${oldestKeys.length} oldest contexts`);
      }
    }
    
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

// Create a default instance
const defaultInstance = new RobustAxios({
  baseURL: '',
});

// Store reference for testing/cleanup
RobustAxios._defaultInstance = defaultInstance;

// Add static methods to RobustAxios that delegate to the default instance
RobustAxios.request = function <T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return defaultInstance.request<T>(config);
};

RobustAxios.get = function <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return defaultInstance.get<T>(url, config);
};

RobustAxios.delete = function <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return defaultInstance.delete<T>(url, config);
};

RobustAxios.head = function <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return defaultInstance.head<T>(url, config);
};

RobustAxios.options = function <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return defaultInstance.options<T>(url, config);
};

RobustAxios.post = function <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return defaultInstance.post<T>(url, data, config);
};

RobustAxios.put = function <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return defaultInstance.put<T>(url, data, config);
};

RobustAxios.patch = function <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return defaultInstance.patch<T>(url, data, config);
};

RobustAxios.getUri = function (config?: AxiosRequestConfig): string {
  return defaultInstance.getUri(config);
};

RobustAxios.setDefaultHeader = function (key: string, value: string): void {
  return defaultInstance.setDefaultHeader(key, value);
};

RobustAxios.updateConfig = function (newConfig: AxiosRequestConfig): void {
  return defaultInstance.updateConfig(newConfig);
};

// Export default instance
export default RobustAxios; 
