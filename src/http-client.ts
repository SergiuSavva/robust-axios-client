import axios, {
  AxiosError,
  AxiosHeaders,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import axiosRetry from 'axios-retry';
import { HttpClientConfig, HttpError, LoggerInterface, TimeoutError, ValidationError } from './types';
import { ConsoleLogger } from './logger/console';

export class HttpClient {
  private axiosInstance: AxiosInstance;
  private logger?: LoggerInterface;
  private dryRun: boolean;
  private debug: boolean;
  private customErrorHandler?: (error: any) => Error;

  constructor(config: HttpClientConfig) {
    this.validateConfig(config);

    this.axiosInstance = axios.create(config);
    this.logger = config.logger ?? new ConsoleLogger();
    this.dryRun = config.dryRun ?? false;
    this.debug = config.debug ?? false;
    this.customErrorHandler = config.customErrorHandler;

    if (config.retry) {
      const { shouldRetry, ...retryConfig } = config.retry;

      axiosRetry(this.axiosInstance, {
        retries: 3,
        retryDelay: (retryCount: number, error: AxiosError) =>
          this.calculateRetryDelay(retryCount, error),
        retryCondition: (error: AxiosError) => this.shouldRetry(error),
        ...retryConfig,
      });
    }

    this.setupInterceptors();
  }

  private calculateRetryDelay(retryCount: number, error: AxiosError): number {
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] || 3;
      if (retryAfter) {
        return parseInt(retryAfter, 10) * 1000;
      }
    }
    return axiosRetry.exponentialDelay(retryCount);
  }

  private shouldRetry(error: AxiosError): boolean {
    const status = error.response?.status;
    const isNetworkOrIdempotent = axiosRetry.isNetworkOrIdempotentRequestError(error);
    const isServerError = status ? status >= 500 : false;
    const isRateLimited = status === 429;

    return isNetworkOrIdempotent || isServerError || isRateLimited;
  }

  private validateConfig(config: HttpClientConfig): void {
    if (!config.baseURL) {
      throw new ValidationError('baseURL is required');
    }
  }

  private sanitizeRequest(config: AxiosRequestConfig): any {
    const safeConfig = { ...config };
    if (safeConfig.headers && safeConfig.headers['Authorization']) {
      safeConfig.headers = {
        ...safeConfig.headers,
        Authorization: '***',
      };
    }
    return safeConfig;
  }

  private setupInterceptors(): void {
    this.axiosInstance.interceptors.request.use(
      (config) => {
        this.logRequest(config);
        return config;
      },
      (error) => {
        this.logger?.error('Request Error:', error);
        return Promise.reject(error);
      },
    );

    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.logResponse(response);
        return response;
      },
      async (error: AxiosError) => {
        this.logger?.error('Response Error:', error);
        return Promise.reject(this.handleError(error));
      },
    );
  }

  private logRequest(config: AxiosRequestConfig): void {
    const safeConfig = this.sanitizeRequest(config);
    const message: Record<string, any> = {
      baseURL: config.baseURL,
      method: config.method,
      url: config.url,
    };

    this.logger?.info('Request:', message);

    if (this.debug) {
      Object.assign(message, {
        headers: safeConfig.headers,
        data: config.data,
      });
      this.logger?.debug('Request:', message);
    }
  }

  private logResponse(response: AxiosResponse): void {
    const message: Record<string, any> = {
      baseURL: response.config.baseURL,
      status: response.status,
    };

    this.logger?.info('Response:', message);

    if (this.debug) {
      Object.assign(message, {
        headers: response.headers,
        data: response.data,
      });
      this.logger?.debug('Response:', message);
    }
  }


  private handleError(error: AxiosError): Error {
    if (this.customErrorHandler) {
      return this.customErrorHandler(error);
    }

    if (error.code === 'ECONNABORTED') {
      return new TimeoutError('Request timed out');
    }

    if (error.response) {
      return new HttpError(error.message, error.response.status, error.response);
    }

    return error;
  }

  public getInstance(): AxiosInstance {
    return this.axiosInstance;
  }

  public async request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    if (this.dryRun) {
      this.logger?.info('Dry run request:', config);
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

  public async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  public async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  public async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  public async delete<T = any>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  public setDefaultHeader(key: string, value: string): void {
    this.axiosInstance.defaults.headers.common[key] = value;
  }

  public updateConfig(newConfig: AxiosRequestConfig): void {
    Object.assign(this.axiosInstance.defaults, newConfig);
  }

  public addRequestInterceptor(
    onFulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>,
    onRejected?: (error: any) => any,
  ): number {
    return this.axiosInstance.interceptors.request.use(onFulfilled, onRejected);
  }

  public addResponseInterceptor(
    onFulfilled: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>,
    onRejected?: (error: any) => any,
  ): number {
    return this.axiosInstance.interceptors.response.use(onFulfilled, onRejected);
  }

  public removeRequestInterceptor(interceptorId: number): void {
    this.axiosInstance.interceptors.request.eject(interceptorId);
  }

  public removeResponseInterceptor(interceptorId: number): void {
    this.axiosInstance.interceptors.response.eject(interceptorId);
  }

  public static all(requests: Promise<any>[]): Promise<any[]> {
    return axios.all(requests);
  }

  public static spread(callback: (...args: any[]) => any): (...args: any[]) => any {
    return axios.spread(callback);
  }
}