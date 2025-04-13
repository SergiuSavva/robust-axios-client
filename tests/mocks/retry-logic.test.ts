import { AxiosMock } from '../helpers/axios-mock';
import RobustAxiosFactory from '../../src';
import { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

describe('Retry Logic with Mocks', () => {
  let axiosMock: AxiosMock;
  
  beforeEach(() => {
    axiosMock = new AxiosMock();
  });
  
  afterEach(() => {
    axiosMock.reset();
    RobustAxiosFactory._resetForTesting();
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
          headers: {},
          url: originalUrlPattern
        } as InternalAxiosRequestConfig
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
          headers: {}
        } as InternalAxiosRequestConfig
      },
      isAxiosError: true,
      toJSON: () => ({}),
      name: 'AxiosError',
      message: 'Request failed with status code 503',
      config: {
        headers: {}
      } as InternalAxiosRequestConfig
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
          headers: {},
          url: originalUrlPattern
        } as InternalAxiosRequestConfig
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
          headers: {}
        } as InternalAxiosRequestConfig
      },
      isAxiosError: true,
      toJSON: () => ({}),
      name: 'AxiosError',
      message: 'Request failed with status code 500',
      config: {
        headers: {}
      } as InternalAxiosRequestConfig
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
          headers: {}
        } as InternalAxiosRequestConfig
      },
      isAxiosError: true,
      toJSON: () => ({}),
      name: 'AxiosError',
      message: 'Request failed with status code 500',
      config: {
        headers: {}
      } as InternalAxiosRequestConfig
    };
    
    // Success response for after recovery
    const successResponse: AxiosResponse = {
      status: 200,
      statusText: 'OK',
      data: { success: true, message: 'Server recovered' },
      headers: {},
      config: {
        headers: {}
      } as InternalAxiosRequestConfig
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
}); 