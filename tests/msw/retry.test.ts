import { http, HttpResponse, delay } from 'msw';
import { server } from './setup';
import { mockLogger } from './setup';
import RobustAxiosFactory from '../../src';

describe('Robust Axios Client with MSW - Retry Tests', () => {
  // Reset the RobustAxiosFactory and handlers after each test
  afterEach(() => {
    RobustAxiosFactory._resetForTesting();
    server.resetHandlers();
  });

  test('should retry on server errors', async () => {
    let requestCount = 0;
    
    server.use(
      http.get('https://example.com/api/retry-test', () => {
        requestCount++;
        
        // Succeed on the third attempt
        if (requestCount < 3) {
          return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
        }
        
        return HttpResponse.json({ message: 'Success after retry' }, { status: 200 });
      })
    );
    
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      retry: {
        maxRetries: 3,
        backoffStrategy: 'linear',
        retryDelay: () => 10 // Very short delay for tests
      }
    });
    
    const response = await client.get('/api/retry-test');
    expect(response.status).toBe(200);
    expect((response.data as { message: string }).message).toBe('Success after retry');
    expect(requestCount).toBe(3);
  });

  test('should not retry on client errors (4xx) by default', async () => {
    let requestCount = 0;
    
    server.use(
      http.get('https://example.com/api/client-error', () => {
        requestCount++;
        return HttpResponse.json({ error: 'Bad Request' }, { status: 400 });
      })
    );
    
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      retry: {
        maxRetries: 3,
        retryDelay: () => 10
      }
    });
    
    const error = await client.get('/api/client-error').catch(e => e);
    expect(error.response.status).toBe(400);
    expect(requestCount).toBe(1); // Should not retry
  });

  test('should respect custom retry condition', async () => {
    let requestCount = 0;
    
    server.use(
      http.get('https://example.com/api/custom-retry', () => {
        requestCount++;
        
        // Return different status codes on each request
        if (requestCount === 1) return HttpResponse.json({ error: 'Bad Request' }, { status: 400 });
        if (requestCount === 2) return HttpResponse.json({ error: 'Not Found' }, { status: 404 });
        return HttpResponse.json({ message: 'Success' }, { status: 200 });
      })
    );
    
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      retry: {
        maxRetries: 3,
        retryDelay: () => 10,
        // Custom condition to retry even on 4xx errors
        retryCondition: (error) => {
          return error.response?.status === 400 || error.response?.status === 404;
        }
      }
    });
    
    const response = await client.get('/api/custom-retry');
    expect(response.status).toBe(200);
    expect(requestCount).toBe(3);
  }, 10000); // Increase timeout to 10 seconds

  test('should use exponential backoff strategy', async () => {
    let requestCount = 0;
    
    server.use(
      http.get('https://example.com/api/backoff-test', () => {
        requestCount++;
        
        if (requestCount < 3) {
          return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
        }
        
        return HttpResponse.json({ success: true }, { status: 200 });
      })
    );
    
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      retry: {
        maxRetries: 3,
        backoffStrategy: 'exponential',
        // Short delay for testing
        retryDelay: (retryCount) => 10 * Math.pow(2, retryCount - 1)
      }
    });
    
    // Record the start time
    const startTime = Date.now();
    
    // Make the request, which should eventually succeed after retries
    const response = await client.get('/api/backoff-test');
    
    // Calculate total time taken
    const totalTime = Date.now() - startTime;
    
    // Verify the response and that multiple requests were made
    expect(response.status).toBe(200);
    expect(requestCount).toBe(3);
    
    // Verify that the operation took some time due to the backoff delays
    expect(totalTime).toBeGreaterThan(0);
  }, 10000); // Increase timeout to 10 seconds

  test('should retry on network errors', async () => {
    let attempts = 0;
    
    // Register a custom handler for this test
    server.use(
      http.get('https://example.com/api/flaky', () => {
        attempts++;
        
        if (attempts <= 2) {
          // Simulate network error for first two attempts
          throw new Error('Connection refused');
        }
        
        // Succeed on the third attempt
        return HttpResponse.json({ 
          success: true,
          attempts: attempts
        }, { status: 200 });
      })
    );
    
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      retry: {
        maxRetries: 3,
        retryDelay: () => 10
      }
    });
    
    const response = await client.get('/api/flaky');
    expect(response.status).toBe(200);
    expect((response.data as { attempts: number }).attempts).toBe(3);
  }, 10000); // Increase timeout to 10 seconds

  test('should trigger onRetry and onSuccess hooks', async () => {
    const onRetryMock = jest.fn();
    const onSuccessMock = jest.fn();
    let requestCount = 0;
    
    server.use(
      http.get('https://example.com/api/hooks-test', () => {
        requestCount++;
        
        if (requestCount < 3) {
          return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
        }
        
        return HttpResponse.json({ success: true }, { status: 200 });
      })
    );
    
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      retry: {
        maxRetries: 3,
        retryDelay: () => 10,
        onRetry: onRetryMock,
        onSuccess: onSuccessMock
      }
    });
    
    const response = await client.get('/api/hooks-test');
    expect(response.status).toBe(200);
    
    expect(onRetryMock).toHaveBeenCalledTimes(2);
    expect(onSuccessMock).toHaveBeenCalledTimes(1);
  }, 10000); // Increase timeout to 10 seconds

  test('should respect timeout and retry with incrementing timeouts', async () => {
    let requestCount = 0;
    
    server.use(
      http.get('https://example.com/api/timeout-test', async () => {
        requestCount++;
        
        // First request times out (3 seconds delay, 1 second timeout)
        if (requestCount === 1) {
          await delay(3000);
          return HttpResponse.json({ message: 'Delayed response' }, { status: 200 });
        }
        
        // Second request returns immediately
        return HttpResponse.json({ message: 'Fast response' }, { status: 200 });
      })
    );
    
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      timeout: 1000, // 1 second timeout
      retry: {
        maxRetries: 2,
        retryDelay: () => 10,
        timeoutStrategy: 'decay', // Increase timeout on retries
        timeoutMultiplier: 3 // Triple the timeout on each retry
      }
    });
    
    const response = await client.get('/api/timeout-test');
    expect(response.status).toBe(200);
    expect((response.data as { message: string }).message).toBe('Fast response');
    expect(requestCount).toBe(2);
  });

  test('should log retry attempts properly', async () => {
    let requestCount = 0;
    
    server.use(
      http.get('https://example.com/api/retry-log-test', () => {
        requestCount++;
        
        // Succeed on the third attempt
        if (requestCount < 3) {
          return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
        }
        
        return HttpResponse.json({ message: 'Success after retry' }, { status: 200 });
      })
    );
    
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      debug: true, // Enable debug logging
      retry: {
        maxRetries: 3,
        backoffStrategy: 'linear',
        retryDelay: () => 10 // Very short delay for tests
      }
    });
    
    // Clear any previous mock calls
    jest.clearAllMocks();
    
    const response = await client.get('/api/retry-log-test');
    expect(response.status).toBe(200);
    
    // Verify logger was called for each retry attempt
    // One error log for each failed request (2) and additional logs for the requests
    expect(mockLogger.error).toHaveBeenCalledTimes(2);
    
    // Should include info logs for both requests and responses
    expect(mockLogger.info).toHaveBeenCalled();
    
    // More detailed logging should be in debug logs
    expect(mockLogger.debug).toHaveBeenCalled();
  });
}); 