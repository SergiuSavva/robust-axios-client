# robust-axios-client

[![npm version](https://img.shields.io/npm/v/robust-axios-client.svg)](https://www.npmjs.com/package/robust-axios-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/robust-axios-client.svg)](https://nodejs.org)

A robust and feature-rich Axios client implementation with built-in retry mechanism, logging, error handling, and more.

## Features

- 🔄 Automatic retry mechanism with exponential backoff
- 📝 Built-in logging system with customizable loggers
- ⚠️ Sophisticated error handling
- 🔍 Debug mode for detailed request/response logging
- 🏃 Dry run capability
- 🔒 Automatic sensitive data sanitization
- 💪 TypeScript support
- 📦 ESM and CommonJS support

## Installation

```bash
npm install robust-axios-client
```

## Quick Start

```typescript
import { HttpClient } from 'robust-axios-client';

const client = new HttpClient({
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
const client = new HttpClient({
  baseURL: 'https://api.example.com', // Required
  debug: false,                       // Optional: enables detailed logging
  dryRun: false,                     // Optional: simulate requests without sending them
  logger: customLogger,              // Optional: custom logger implementation
});
```

### Retry Configuration

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  retry: {
    retries: 3,                      // Number of retry attempts
    shouldRetry: (error) => boolean, // Custom retry condition
    retryDelay: (retryCount) => number, // Custom delay between retries
  }
});
```

### Custom Error Handler

```typescript
const client = new HttpClient({
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
  info(message: string, data?: any): void {
    console.log(message, data);
  }
  
  error(message: string, data?: any): void {
    console.error(message, data);
  }
  
  debug(message: string, data?: any): void {
    console.debug(message, data);
  }
}

const client = new HttpClient({
  baseURL: 'https://api.example.com',
  logger: new CustomLogger(),
});
```

### Custom Retry Logic

```typescript
const client = new HttpClient({
  baseURL: 'https://api.example.com',
  retry: {
    shouldRetry: (error) => {
      const status = error.response?.status;
      return status === 429 || status >= 500;
    }
  }
});
```

## API Reference

### HttpClient Methods

- `get(url: string, config?: AxiosRequestConfig)`
- `post(url: string, data?: any, config?: AxiosRequestConfig)`
- `put(url: string, data?: any, config?: AxiosRequestConfig)`
- `patch(url: string, data?: any, config?: AxiosRequestConfig)`
- `delete(url: string, config?: AxiosRequestConfig)`

### Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| baseURL | string | Yes | - | Base URL for the API |
| debug | boolean | No | false | Enable detailed logging |
| dryRun | boolean | No | false | Simulate requests without sending |
| logger | LoggerInterface | No | ConsoleLogger | Custom logger implementation |
| retry | RetryConfig | No | - | Retry configuration |
| customErrorHandler | Function | No | - | Custom error handler |

## Error Handling

The client automatically handles common HTTP errors and provides detailed error information:

- Network errors
- Rate limiting (429)
- Server errors (5xx)
- Validation errors
- Timeout errors

## TypeScript Support

This library is written in TypeScript and includes type definitions out of the box.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Sergiu Savva

## Support

For bugs and feature requests, please [open an issue](https://github.com/sergiu.savva/robust-axios-client/issues).