import axios, {
  AxiosError,
  AxiosHeaders,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig
} from 'axios';

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
  private axiosInstance: AxiosInstance;
  private logger: LoggerInterface;
  private dryRun: boolean;
  private debug: boolean;
  private customErrorHandler?: (error: unknown) => Error;
  private retryConfig: Required<RetryConfig>;
  private circuitBreaker?: CircuitBreaker;
  private rateLimiter?: TokenBucketRateLimiter;
  private retryContexts: Map<string, RetryContext> = new Map();

  // Static methods to match axios API
  public static create(config: RobustAxiosConfig): RobustAxios {
    return new RobustAxios(config);
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

  // Constructor
  constructor(config: RobustAxiosConfig) {
    this.axiosInstance = axios.create(config);
    this.logger = config.logger ?? new ConsoleLogger();
    this.dryRun = config.dryRun ?? false;
    this.debug = config.debug ?? false;
    this.customErrorHandler = config.customErrorHandler;

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

  // Interceptor setup
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
        }

        return response;
      },
      async (error: AxiosError) => {
        this.logger.error('Response Error:', error);

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
        return Promise.reject(this.handleError(error));
      }
    );
  }

  // Retry decision logic
  private async shouldRetry(error: AxiosError, context: RetryContext): Promise<boolean> {
    const categorySettings = this.getCategorySettings(context.category);
    const maxRetries = categorySettings?.maxRetries ?? this.retryConfig.maxRetries;
    const retryCondition = categorySettings?.retryCondition ?? this.retryConfig.retryCondition;

    return (
      context.retryCount < maxRetries &&
      (await Promise.resolve(retryCondition(error)))
    );
  }

  // Retry execution
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

    // Wait for the calculated delay
    await new Promise(resolve => setTimeout(resolve, delay));

    // Perform the retry
    return this.axiosInstance(error.config!);
  }

  // Calculate retry delay based on strategy
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

  // Calculate Fibonacci sequence value
  private calculateFibonacciDelay(n: number): number {
    const fibonacci = (num: number): number => {
      if (num <= 1) return num;
      return fibonacci(num - 1) + fibonacci(num - 2);
    };
    return fibonacci(n) * 1000;
  }

  // Calculate next timeout based on strategy
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

  // Request sanitization for logging
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

  // Request logging
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

  // Response logging
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

  // Error handling
  private handleError(error: AxiosError | Error): Error {
    if (this.customErrorHandler) {
      return this.customErrorHandler(error);
    }

    if (error instanceof RateLimitError) {
      return error;
    }

    if (error instanceof AxiosError) {
      if (error.code === 'ECONNABORTED') {
        return new TimeoutError('Request timed out');
      }

      if (error.response) {
        return new HttpError(error.message, error.response.status, error.response);
      }
    }

    return error;
  }

  // Request ID generation for tracking
  private generateRequestId(config: AxiosRequestConfig): string {
    return `${config.method || 'unknown'}-${config.url || 'unknown'}-${Date.now()}`;
  }

  // Retrieve retry context
  private getRetryContext(config?: AxiosRequestConfig): RetryContext | undefined {
    if (!config) return undefined;
    const requestId = this.generateRequestId(config);
    return this.retryContexts.get(requestId);
  }

  // Request categorization
  private determineRequestCategory(config: AxiosRequestConfig): string | undefined {
    for (const [category, categoryConfig] of Object.entries(this.retryConfig.requestCategories)) {
      if (categoryConfig.matcher(config)) {
        return category;
      }
    }
    return undefined;
  }

  // Get category-specific settings
  private getCategorySettings(category: string | undefined): Partial<RetryConfig> | undefined {
    if (!category) return undefined;
    return this.retryConfig.requestCategories[category]?.settings;
  }

  // Public API methods
  public getInstance(): AxiosInstance {
    return this.axiosInstance;
  }

  // Request method (main method)
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

  // Configuration methods
  public setDefaultHeader(key: string, value: string): void {
    this.axiosInstance.defaults.headers.common[key] = value;
  }

  public updateConfig(newConfig: AxiosRequestConfig): void {
    Object.assign(this.axiosInstance.defaults, newConfig);
  }

  // Interceptor management
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

  // Aliases and methods to match axios API
  public getUri(config?: AxiosRequestConfig): string {
    return this.axiosInstance.getUri(config);
  }
}

// Create a default instance
const defaultInstance = new RobustAxios({
  baseURL: '',
});

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
