# robust-axios-client

[![npm version](https://img.shields.io/npm/v/robust-axios-client/v1.0.0.svg)](https://www.npmjs.com/package/robust-axios-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/robust-axios-client.svg)](https://nodejs.org)

A robust and feature-rich Axios client implementation with advanced resilience patterns, including retries, circuit breaker, rate limiting, and more.

## Features

- 🔄 Advanced retry mechanism with multiple backoff strategies
- 🔌 Circuit breaker pattern to prevent cascading failures
- 🚦 Rate limiting with token bucket algorithm
- 📝 Comprehensive logging system with customizable loggers
- ⚠️ Sophisticated error handling and categorization
- 🔍 Debug mode for detailed request/response logging
- 🏃 Dry run capability for testing
- 🔒 Automatic sensitive data sanitization
- 🎯 Request categorization for endpoint-specific behavior
- 💪 Full TypeScript support
- 📦 Complete Axios API compatibility

## Installation

```bash
npm install robust-axios-client
```

## Quick Start

```typescript
import RobustAxios from 'robust-axios-client';

const client = RobustAxios.create({
  baseURL: 'https://api.example.com',
});

// Make a GET request
const response = await client.get('/users');

// Make a POST request
const user = await client.post('/users', { name: 'John Doe' });
```

## Configuration

### Basic Configuration

```typescript
const client = RobustAxios.create({
  baseURL: 'https://api.example.com', // Required
  debug: false,                       // Optional: enables detailed logging
  dryRun: false,                     // Optional: simulate requests without sending them
  logger: customLogger,              // Optional: custom logger implementation
});
```

### Retry Configuration

```typescript
const client = RobustAxios.create({
  baseURL: 'https://api.example.com',
  retry: {
    maxRetries: 3,                     // Number of retry attempts
    retryCondition: (error) => boolean, // Custom retry condition
    retryDelay: (retryCount, error) => number, // Custom delay between retries
    backoffStrategy: 'exponential',    // 'exponential', 'linear', 'fibonacci', or 'custom'
    customBackoff: (retryCount, error) => number, // Custom backoff function
    timeoutStrategy: 'decay',         // 'reset', 'decay', or 'fixed'
    timeoutMultiplier: 1.5            // Used with 'decay' strategy
  }
});
```

### Circuit Breaker Configuration

```typescript
const client = RobustAxios.create({
  baseURL: 'https://api.example.com',
  retry: {
    circuitBreaker: {
      failureThreshold: 5,           // Number of failures before opening circuit
      resetTimeout: 60000,           // Time in ms before attempting half-open state
      halfOpenMaxRequests: 3         // Max requests to allow in half-open state
    },
    onCircuitBreakerStateChange: (newState) => {
      console.log(`Circuit breaker state changed to: ${newState}`);
    }
  }
});
```

### Rate Limiting Configuration

```typescript
const client = RobustAxios.create({
  baseURL: 'https://api.example.com',
  rateLimit: {
    maxRequests: 100,  // Maximum number of requests
    windowMs: 60000,   // Time window in milliseconds (1 minute)
  }
});
```

### Custom Error Handler

```typescript
const client = RobustAxios.create({
  baseURL: 'https://api.example.com',
  customErrorHandler: (error) => {
    // Custom error handling logic
    return new Error('Custom error message');
  }
});
```

## Advanced Usage

### Custom Logger Implementation

```typescript
import { LoggerInterface } from 'robust-axios-client';

class CustomLogger implements LoggerInterface {
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

const client = RobustAxios.create({
  baseURL: 'https://api.example.com',
  logger: new CustomLogger(),
});
```

### Request Categorization

```typescript
const client = RobustAxios.create({
  baseURL: 'https://api.example.com',
  retry: {
    requestCategories: {
      authEndpoints: {
        matcher: (config) => config.url?.includes('/auth'),
        settings: {
          maxRetries: 1,
          backoffStrategy: 'linear'
        }
      },
      userEndpoints: {
        matcher: (config) => config.url?.includes('/users'),
        settings: {
          maxRetries: 5,
          backoffStrategy: 'exponential'
        }
      }
    }
  }
});
```

### Event Hooks

```typescript
const client = RobustAxios.create({
  baseURL: 'https://api.example.com',
  retry: {
    onRetry: (context) => {
      console.log(`Retrying request. Attempt: ${context.retryCount}`);
    },
    onSuccess: (response, context) => {
      console.log(`Request succeeded after ${context.retryCount} retries`);
    },
    onFailed: (error, context) => {
      console.log(`Request failed after ${context.retryCount} retries`);
    }
  }
});
```

## API Reference

### RobustAxios Methods

#### Static Methods
- `create(config: RobustAxiosConfig): RobustAxios`
- `request<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `get<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `delete<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `head<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `options<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `getUri(config?: AxiosRequestConfig): string`
- `all<T>(values: Array<T | Promise<T>>): Promise<T[]>`
- `spread<T, R>(callback: (...args: T[]) => R): (array: T[]) => R`
- `isCancel(value: unknown): boolean`
- `isAxiosError(payload: unknown): payload is AxiosError`

#### Instance Methods
- `request<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `get<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `delete<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `head<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `options<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>`
- `getUri(config?: AxiosRequestConfig): string`
- `getInstance(): AxiosInstance`
- `setDefaultHeader(key: string, value: string): void`
- `updateConfig(newConfig: AxiosRequestConfig): void`
- `addRequestInterceptor(onFulfilled, onRejected?): number`
- `addResponseInterceptor(onFulfilled, onRejected?): number`
- `removeRequestInterceptor(interceptorId: number): void`
- `removeResponseInterceptor(interceptorId: number): void`

### Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| baseURL | string | No | '' | Base URL for the API |
| debug | boolean | No | false | Enable detailed logging |
| dryRun | boolean | No | false | Simulate requests without sending |
| logger | LoggerInterface | No | ConsoleLogger | Custom logger implementation |
| retry | RetryConfig | No | Default config | Retry configuration |
| customErrorHandler | Function | No | Built-in handler | Custom error handler |
| rateLimit | { maxRequests: number, windowMs: number } | No | undefined | Rate limiting configuration |
| ...other AxiosRequestConfig options | various | No | Axios defaults | Any valid Axios request config |

## Error Handling

The client handles various error scenarios with dedicated error classes:

- `HttpError` - For HTTP status errors with detailed response information
- `TimeoutError` - For request timeouts (ECONNABORTED)
- `RateLimitError` - When rate limit is exceeded
- `ValidationError` - For validation errors

## TypeScript Support

This library is written in TypeScript and includes comprehensive type definitions.

## Testing

### E2E Testing with Fake API Service

This library includes a fake API service for end-to-end testing without relying on external services. This is particularly useful for testing error handling, retry mechanisms, circuit breakers, and other resilience features.

```typescript
import { TestServer } from 'robust-axios-client/tests/helpers/test-server';
import RobustAxios from 'robust-axios-client';

// Start the test server
const server = new TestServer();
const baseURL = await server.start();

// Create a client pointing to the test server
const client = RobustAxios.create({ baseURL });

// Simulate a server error
server.setFailurePattern('/api/users', 500);

// Simulate rate limiting
server.setRateLimit('/api/data', 5, 10000);

// Simulate slow responses
server.setResponseDelay('/api/slow', 3000);

// Make requests to test different scenarios
try {
  await client.get('/api/users');
} catch (error) {
  // Handle server error
}

// Clean up when done
await server.stop();
```

For more detailed examples and documentation, see the [E2E Testing README](tests/e2e/README.md).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Sergiu Savva

## Support

For bugs and feature requests, please [open an issue](https://github.com/sergiusavva/robust-axios-client/issues).
