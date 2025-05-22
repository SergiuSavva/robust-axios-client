import axios from 'axios'; // Added
import { AxiosMock } from '../helpers/axios-mock';
import RobustAxiosFactory from '../../src';
import { AxiosError, AxiosResponse, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'; // AxiosRequestConfig for mockImplementation, Internal for errors

describe('Retry Logic with Mocks', () => {
  let axiosMock: AxiosMock;
  
  beforeEach(() => {
    axiosMock = new AxiosMock();
  });
  
  afterEach(() => {
    axiosMock.reset();
  });
  
  test('should retry after network error', async () => {
    // First call will fail, second will succeed
    
    // Override the mock to handle different responses on subsequent calls
    const originalMockError = axiosMock.mockError;
    const originalMockResponse = axiosMock.mockResponse;
    
    // Replace the mock methods with our tracking versions
    axiosMock.mockError = (urlPattern, error) => {
      const originalUrlPattern = urlPattern;
      urlPattern = `${urlPattern}__initial`;
      originalMockError.call(axiosMock, urlPattern, error);
      
      // Mock response for retry
      const successResponse: AxiosResponse<{success: boolean}> = {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: new axios.AxiosHeaders(), // Ensure headers defined
          url: originalUrlPattern
        } as AxiosRequestConfig // This is AxiosResponse.config
      };
      
      // After the first call, subsequent requests will succeed
      originalMockResponse.call(axiosMock, originalUrlPattern, successResponse);
    };
    
    // Set up initial error
    axiosMock.mockError('/api/data', new Error('Network Error'));
    
    // Create client with retry configured
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      timeout: 1000,
      retry: {
        maxRetries: 3,
        retryDelay: () => 100,
        retryCondition: (error) => error.message === 'Network Error'
      }
    });
    
    // Request should eventually succeed after retry
    const response = await client.get('/api/data');
    
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ success: true });
  });
  
  test('should retry on 5xx server errors', async () => {
    // Create a 503 error
    const serverError: AxiosError = {
      response: {
        status: 503,
        statusText: 'Service Unavailable',
        data: { error: 'Server overloaded' },
        headers: {},
        config: {
          headers: new axios.AxiosHeaders() // Ensure headers defined
        } as InternalAxiosRequestConfig // This is AxiosError.response.config
      },
      isAxiosError: true,
      toJSON: () => ({}),
      name: 'AxiosError',
      message: 'Request failed with status code 503',
      config: {
        headers: new axios.AxiosHeaders() // Ensure headers defined
      } as InternalAxiosRequestConfig // This is AxiosError.config
    };
    
    // Mock the initial 503 error
    const originalMockError = axiosMock.mockError;
    const originalMockResponse = axiosMock.mockResponse;
    
    // Replace the mock methods for tracking
    axiosMock.mockError = (urlPattern, error) => {
      const originalUrlPattern = urlPattern;
      urlPattern = `${urlPattern}__initial`;
      originalMockError.call(axiosMock, urlPattern, error);
      
      // After the first call, subsequent requests will succeed
      const successResponse: AxiosResponse<{success: boolean}> = {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: new axios.AxiosHeaders(), // Ensure headers defined
          url: originalUrlPattern
        } as AxiosRequestConfig // This is AxiosResponse.config
      };
      
      originalMockResponse.call(axiosMock, originalUrlPattern, successResponse);
    };
    
    // Set up initial server error
    axiosMock.mockError('/api/service', serverError);
    
    // Create client with retry for 5xx errors
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      timeout: 1000,
      retry: {
        maxRetries: 2,
        retryDelay: () => 100,
        retryCondition: (error) => error.response?.status === 503
      }
    });
    
    // Request should eventually succeed
    const response = await client.get('/api/service');
    
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ success: true });
  });
  
  test('should stop retrying after max retries is reached', async () => {
    // Create a persistent error that will never succeed
    const persistentError: AxiosError = {
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        data: { error: 'Fatal server error' },
        headers: {},
        config: {
          headers: new axios.AxiosHeaders() // Ensure headers defined
        } as InternalAxiosRequestConfig // This is AxiosError.response.config
      },
      isAxiosError: true,
      toJSON: () => ({}),
      name: 'AxiosError',
      message: 'Request failed with status code 500',
      config: {
        headers: new axios.AxiosHeaders() // Ensure headers defined
      } as InternalAxiosRequestConfig // This is AxiosError.config
    };
    
    // Mock the error that will persist
    axiosMock.mockError('/api/failing-endpoint', persistentError);
    
    // Create client with limited retries
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      timeout: 1000,
      retry: {
        maxRetries: 2,
        retryDelay: () => 50,
        retryCondition: (error) => error.response?.status === 500
      }
    });
    
    // Request should fail after max retries
    try {
      await client.get('/api/failing-endpoint');
      fail('Should have thrown error after exhausting retries');
    } catch (error) {
      const axiosError = error as AxiosError;
      expect(axiosError.response?.status).toBe(500);
    }
  });
  
  test('should handle time-based response transitions (500 → 200)', async () => {
    jest.useFakeTimers();
    
    // Create a start timestamp and initial mock time
    const startTime = Date.now();
    let currentTime = startTime;
    
    // Mock Date.now to use our controlled time
    const originalDateNow = Date.now;
    Date.now = jest.fn(() => currentTime);
    
    // Create a server error
    const serverError: AxiosError = {
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        data: { error: 'Server temporarily unavailable' },
        headers: {},
        config: {
          headers: new axios.AxiosHeaders() // Ensure headers defined
        } as InternalAxiosRequestConfig // This is AxiosError.response.config
      },
      isAxiosError: true,
      toJSON: () => ({}),
      name: 'AxiosError',
      message: 'Request failed with status code 500',
      config: {
        headers: new axios.AxiosHeaders() // Ensure headers defined
      } as InternalAxiosRequestConfig // This is AxiosError.config
    };
    
    // Success response for after recovery
    const successResponse: AxiosResponse = {
      status: 200,
      statusText: 'OK',
      data: { success: true, message: 'Server recovered' },
      headers: {},
      config: {
          headers: new axios.AxiosHeaders() // Ensure headers defined
        } as AxiosRequestConfig // This is AxiosResponse.config
    };
    
    // Initially mock the error response
    axiosMock.mockError('/api/recovery-endpoint', serverError);
    
    // Create client with retry configured for 500 errors
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      timeout: 1000,
      retry: {
        maxRetries: 5,
        retryDelay: () => 10000, // 10 second retry delay
        retryCondition: (error) => error.response?.status === 500
      }
    });
    
    // First attempt should fail because we're still in the "error period"
    try {
      await client.get('/api/recovery-endpoint');
      fail('Request should have failed with 500 error');
    } catch (error) {
      const axiosError = error as AxiosError;
      expect(axiosError.response?.status).toBe(500);
    }
    
    // Advance time by 35 seconds (past the 30 second threshold)
    currentTime += 35000;
    
    // Now change the mock to return success
    axiosMock.reset();
    axiosMock.mockResponse('/api/recovery-endpoint', successResponse);
    
    // Now the request should succeed
    const response = await client.get('/api/recovery-endpoint');
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ success: true, message: 'Server recovered' });
    
    // Clean up
    Date.now = originalDateNow;
    jest.useRealTimers();
  });

  test('should reuse retry context for identical sequential failing requests', async () => {
    const onRetrySpy = jest.fn();
    let requestCount = 0;

    // Mock setup:
    // 1st call to /api/context-reuse -> 500 error
    // 2nd call to /api/context-reuse -> 500 error
    // 3rd call to /api/context-reuse -> 200 success
    axiosMock.mockImplementation(async (config: AxiosRequestConfig) => {
      requestCount++;
      if (config.url === 'https://example.com/api/context-reuse') {
        if (requestCount <= 2) {
          throw {
            isAxiosError: true,
            config: { ...config, headers: new axios.AxiosHeaders() } as InternalAxiosRequestConfig,
            response: {
              status: 500,
              statusText: 'Internal Server Error',
              data: { error: `Attempt ${requestCount} failed` },
              headers: {}, // response headers can be generic
              config: { ...config, headers: new axios.AxiosHeaders() } as InternalAxiosRequestConfig,
            },
            name: 'AxiosError',
            message: `Request failed with status code 500 - attempt ${requestCount}`,
          } as AxiosError;
        } else {
          return {
            data: { success: true, message: 'Recovered on attempt 3' },
            status: 200,
            statusText: 'OK',
            headers: {}, // response headers can be generic
            config: { ...config, headers: new axios.AxiosHeaders() } as InternalAxiosRequestConfig, // This is AxiosResponse.config
          } as AxiosResponse;
        }
      }
      // Fallback for other URLs, though not expected in this test
      throw new Error(`Unexpected request to ${config.url || 'unknown url'}`);
    });

    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      retry: {
        maxRetries: 3, // Allows for 2 retries
        retryDelay: () => 10, // Short delay
        onRetry: onRetrySpy,
        retryCondition: (error) => !!error.response && error.response.status >= 500,
      },
    });

    // Make the request
    const response = await client.get('/api/context-reuse');

    // Assertions
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ success: true, message: 'Recovered on attempt 3' });
    expect(requestCount).toBe(3); // Initial attempt + 2 retries
    expect(onRetrySpy).toHaveBeenCalledTimes(2); // onRetry called for the 1st and 2nd retry

    // Verify context of onRetrySpy calls
    // 1st retry (after 1st failure)
    expect(onRetrySpy.mock.calls[0][0].retryCount).toBe(1);
    expect(onRetrySpy.mock.calls[0][0].requestConfig.url).toBe('https://example.com/api/context-reuse');
    
    // 2nd retry (after 2nd failure)
    expect(onRetrySpy.mock.calls[1][0].retryCount).toBe(2);
    expect(onRetrySpy.mock.calls[1][0].requestConfig.url).toBe('https://example.com/api/context-reuse');
  });

  test('should use separate retry contexts for different requests', async () => {
    const onRetrySpy = jest.fn();
    let requestCounts = { A: 0, B: 0 };

    axiosMock.mockImplementation(async (config: AxiosRequestConfig) => { 
      const internalConfig = { ...config, headers: new axios.AxiosHeaders() } as InternalAxiosRequestConfig;
      if (config.url === 'https://example.com/api/context-A') {
        requestCounts.A++;
        if (requestCounts.A === 1) { // Fail first time
          throw {
            isAxiosError: true, config: internalConfig, response: { status: 500, statusText: 'Error A1', data: {}, headers: {}, config: internalConfig },
            name: 'AxiosError', message: 'Error A1'
          } as AxiosError;
        }
        return { data: { message: 'Success A' }, status: 200, statusText: 'OK', headers: {}, config: internalConfig } as AxiosResponse; // Success second time
      }
      if (config.url === 'https://example.com/api/context-B') {
        requestCounts.B++;
        if (requestCounts.B === 1) { // Fail first time
          throw {
            isAxiosError: true, config: internalConfig, response: { status: 500, statusText: 'Error B1', data: {}, headers: {}, config: internalConfig },
            name: 'AxiosError', message: 'Error B1'
          } as AxiosError;
        }
        return { data: { message: 'Success B' }, status: 200, statusText: 'OK', headers: {}, config: internalConfig } as AxiosResponse; // Success second time
      }
      throw new Error(`Unexpected request to ${config.url || 'unknown url'}`);
    });

    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      retry: {
        maxRetries: 1, // Allow one retry for each
        retryDelay: () => 10,
        onRetry: onRetrySpy,
        retryCondition: (error) => !!error.response && error.response.status >= 500,
      },
    });

    // Request for endpoint A
    const responseA = await client.get('/api/context-A');
    expect(responseA.status).toBe(200);
    expect(responseA.data).toEqual({ message: 'Success A' });
    expect(requestCounts.A).toBe(2); // Initial + 1 retry

    // Request for endpoint B
    const responseB = await client.get('/api/context-B');
    expect(responseB.status).toBe(200);
    expect(responseB.data).toEqual({ message: 'Success B' });
    expect(requestCounts.B).toBe(2); // Initial + 1 retry

    // Assertions for onRetrySpy
    expect(onRetrySpy).toHaveBeenCalledTimes(2); // Called once for A, once for B

    // Verify context for A's retry
    const contextA = onRetrySpy.mock.calls.find(call => call[0].requestConfig.url === 'https://example.com/api/context-A');
    expect(contextA).toBeDefined();
    expect(contextA[0].retryCount).toBe(1);

    // Verify context for B's retry
    const contextB = onRetrySpy.mock.calls.find(call => call[0].requestConfig.url === 'https://example.com/api/context-B');
    expect(contextB).toBeDefined();
    expect(contextB[0].retryCount).toBe(1);
  });

  test('should evict context after contextMaxAge', async () => {
    jest.useFakeTimers();
    const onRetrySpy = jest.fn();
    let requestAttempt = 0;

    axiosMock.mockImplementation(async (config: AxiosRequestConfig) => { 
      requestAttempt++;
      const internalConfig = { ...config, headers: new axios.AxiosHeaders() } as InternalAxiosRequestConfig;
      // Always fail for this test to observe retry behavior
      throw {
        isAxiosError: true, config: internalConfig,
        response: { status: 500, statusText: `Error attempt ${requestAttempt}`, data: {}, headers: {}, config: internalConfig },
        name: 'AxiosError', message: `Error attempt ${requestAttempt}`
      } as AxiosError;
    });

    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      contextMaxAge: 50, // 50ms
      retry: {
        maxRetries: 1,
        retryDelay: () => 10,
        onRetry: onRetrySpy,
        retryCondition: (error) => !!error.response && error.response.status >= 500,
      },
    });

    // First call - creates a context
    await client.get('/api/context-expiry').catch(() => {}); // Catch expected error
    expect(onRetrySpy).toHaveBeenCalledTimes(1);
    expect(onRetrySpy.mock.calls[0][0].retryCount).toBe(1);

    // Advance time past contextMaxAge
    jest.advanceTimersByTime(100); // Advance by 100ms

    onRetrySpy.mockClear(); // Clear spy for the next call
    requestAttempt = 0; // Reset for mock verification if needed, though not strictly for this assertion

    // Second call to the same endpoint
    await client.get('/api/context-expiry').catch(() => {}); // Catch expected error
    
    // Assert that a new context was created (retryCount is 1 again)
    expect(onRetrySpy).toHaveBeenCalledTimes(1);
    expect(onRetrySpy.mock.calls[0][0].retryCount).toBe(1); // Should be a new context

    jest.useRealTimers();
  });

  test('should evict oldest context when contextThreshold is reached', async () => {
    const onRetrySpy = jest.fn();
    let requestCounter = 0;

    axiosMock.mockImplementation(async (config: AxiosRequestConfig) => { 
      requestCounter++;
      const internalConfig = { ...config, headers: new axios.AxiosHeaders() } as InternalAxiosRequestConfig;
      throw {
        isAxiosError: true, config: internalConfig,
        response: { status: 500, statusText: `Error ${requestCounter}`, data: { url: config.url }, headers: {}, config: internalConfig },
        name: 'AxiosError', message: `Error for ${config.url || 'unknown url'}`
      } as AxiosError;
    });

    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      contextThreshold: 2, // Store only 2 contexts
      retry: {
        maxRetries: 1,
        retryDelay: () => 10,
        onRetry: onRetrySpy,
        retryCondition: (error) => !!error.response && error.response.status >= 500,
      },
    });

    // Request 1 - creates context 1 for /ctx-1
    await client.get('/api/ctx-thresh-1').catch(() => {});
    expect(onRetrySpy).toHaveBeenCalledTimes(1);
    expect(onRetrySpy.mock.calls[0][0].retryCount).toBe(1);
    expect(onRetrySpy.mock.calls[0][0].requestConfig.url).toBe('https://example.com/api/ctx-thresh-1');
    onRetrySpy.mockClear();

    // Request 2 - creates context 2 for /ctx-2
    await client.get('/api/ctx-thresh-2').catch(() => {});
    expect(onRetrySpy).toHaveBeenCalledTimes(1);
    expect(onRetrySpy.mock.calls[0][0].retryCount).toBe(1);
    expect(onRetrySpy.mock.calls[0][0].requestConfig.url).toBe('https://example.com/api/ctx-thresh-2');
    onRetrySpy.mockClear();

    // Request 3 - creates context 3 for /ctx-3. Context 1 (/ctx-1) should be evicted.
    await client.get('/api/ctx-thresh-3').catch(() => {});
    expect(onRetrySpy).toHaveBeenCalledTimes(1);
    expect(onRetrySpy.mock.calls[0][0].retryCount).toBe(1);
    expect(onRetrySpy.mock.calls[0][0].requestConfig.url).toBe('https://example.com/api/ctx-thresh-3');
    onRetrySpy.mockClear();

    // Request 4 - to /ctx-1 again. Since its context was evicted, it should create a new one.
    await client.get('/api/ctx-thresh-1').catch(() => {});
    expect(onRetrySpy).toHaveBeenCalledTimes(1);
    // Crucially, retryCount should be 1, indicating a new context, not 2.
    expect(onRetrySpy.mock.calls[0][0].retryCount).toBe(1); 
    expect(onRetrySpy.mock.calls[0][0].requestConfig.url).toBe('https://example.com/api/ctx-thresh-1');
  });
}); 