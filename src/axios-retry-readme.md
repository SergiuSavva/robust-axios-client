# Enhanced Axios Retry

A powerful and flexible retry library for Axios with circuit breaker pattern, rate limiting, and advanced retry strategies.

## Features

- 🔄 Multiple retry strategies (exponential, linear, fibonacci)
- 🛡️ Circuit breaker pattern support
- ⏰ Rate limiting with token bucket algorithm
- 📊 Request categorization
- 🎯 Detailed retry context and monitoring
- ⚡ Flexible timeout handling
- 🔍 TypeScript support

## Installation

```bash
npm install enhanced-axios-retry
# or
yarn add enhanced-axios-retry
```

## Basic Usage

```typescript
import axios from 'axios';
import { createEnhancedAxiosRetry } from 'enhanced-axios-retry';

const axiosInstance = axios.create({
  baseURL: 'https://api.example.com'
});

// Create retry handler with default settings
createEnhancedAxiosRetry(axiosInstance);

// Use your axios instance as normal
try {
  const response = await axiosInstance.get('/users');
  console.log('Success:', response.data);
} catch (error) {
  console.error('Failed after all retries:', error);
}
```

## Advanced Configuration

### Custom Retry Strategy

```typescript
const config: IEnhancedRetryConfig = {
  maxRetries: 5,
  backoffStrategy: 'exponential',
  timeoutStrategy: 'decay',
  timeoutMultiplier: 1.5,
  
  retryCondition: (error) => {
    return (
      error.response?.status === 429 || // Rate limit exceeded
      error.response?.status === 503 || // Service unavailable
      error.code === 'ECONNABORTED'     // Timeout
    );
  },
  
  onRetry: async (context) => {
    console.log(`Retry attempt ${context.retryCount}`);
  }
};

createEnhancedAxiosRetry(axiosInstance, config);
```

### Request Categories

Configure different retry policies for different types of requests:

```typescript
const config: IEnhancedRetryConfig = {
  requestCategories: {
    critical: {
      matcher: (config) => config.url.startsWith('/payments'),
      settings: {
        maxRetries: 7,
        backoffStrategy: 'exponential',
        timeoutStrategy: 'reset'
      }
    },
    analytics: {
      matcher: (config) => config.url.startsWith('/analytics'),
      settings: {
        maxRetries: 1,
        backoffStrategy: 'linear'
      }
    }
  }
};
```

### Rate Limiting

Implement rate limiting to prevent overwhelming the server:

```typescript
const config: IEnhancedRetryConfig = {
  rateLimit: {
    maxRequests: 50,
    windowMs: 60000, // 1 minute
    strategy: 'token-bucket'
  }
};
```

### Circuit Breaker

Prevent cascading failures with circuit breaker pattern:

```typescript
const config: IEnhancedRetryConfig = {
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 30000, // 30 seconds
    halfOpenMaxRequests: 3
  },
  
  onCircuitBreakerStateChange: (newState) => {
    console.log(`Circuit breaker state changed to: ${newState}`);
  }
};
```

## Configuration Options

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRetries` | number | 3 | Maximum number of retry attempts |
| `retryCondition` | function | - | Function to determine if retry should be attempted |
| `retryDelay` | function | - | Function to calculate delay between retries |
| `backoffStrategy` | string | 'exponential' | Retry delay strategy ('exponential', 'linear', 'fibonacci', 'custom') |

### Timeout Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeoutStrategy` | string | 'decay' | How timeout should be handled between retries |
| `timeoutMultiplier` | number | 1.5 | Factor to multiply timeout by when using 'decay' strategy |

### Circuit Breaker Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `failureThreshold` | number | 5 | Number of failures before circuit opens |
| `resetTimeout` | number | 60000 | Time (ms) before attempting to close circuit |
| `halfOpenMaxRequests` | number | 3 | Maximum requests allowed in half-open state |

### Rate Limiting Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRequests` | number | 100 | Maximum requests in time window |
| `windowMs` | number | 60000 | Time window for rate limiting (ms) |
| `strategy` | string | 'token-bucket' | Rate limiting algorithm |

## Events and Monitoring

The library provides several hooks for monitoring retry behavior:

```typescript
const config: IEnhancedRetryConfig = {
  onRetry: async (context) => {
    // Called before each retry attempt
  },
  onSuccess: (response, context) => {
    // Called when request succeeds after retries
  },
  onFailed: (error, context) => {
    // Called when all retries have failed
  },
  onCircuitBreakerStateChange: (newState) => {
    // Called when circuit breaker state changes
  }
};
```

## Error Handling

The library provides detailed error information in the retry context:

```typescript
try {
  await axiosInstance.get('/api/data');
} catch (error) {
  console.log('Retry attempts:', error.config['axios-retry'].retryCount);
  console.log('Attempt history:', error.config['axios-retry'].attempts);
}
```

## TypeScript Support

The library is written in TypeScript and provides comprehensive type definitions:

```typescript
import { IEnhancedRetryConfig, RetryContext } from 'enhanced-axios-retry';
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Credits

Created by [Your Name]
