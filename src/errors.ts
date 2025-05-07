import { AxiosResponse } from 'axios';

// Error classes
export class HttpError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: AxiosResponse
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
  constructor(message: string, statusCode: number, response?: AxiosResponse) {
    super(message, statusCode, response);
    this.name = 'ServerError';
  }
}

export class ClientError extends HttpError {
  constructor(message: string, statusCode: number, response?: AxiosResponse) {
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
