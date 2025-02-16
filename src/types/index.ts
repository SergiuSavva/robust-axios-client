import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { IAxiosRetryConfig } from 'axios-retry';

export interface LoggerInterface {
  debug(message: string, ...args: any[]): void;

  info(message: string, ...args: any[]): void;

  warn(message: string, ...args: any[]): void;

  error(message: string, ...args: any[]): void;
}

export interface RetryConfig extends Omit<IAxiosRetryConfig, 'retryCondition'> {
  shouldRetry?: (error: AxiosError) => boolean;
}

export interface HttpClientConfig extends AxiosRequestConfig {
  retry?: RetryConfig;
  logger?: LoggerInterface;
  dryRun?: boolean;
  debug?: boolean;
  customErrorHandler?: (error: any) => Error;
  retryNonIdempotent?: boolean;
}

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