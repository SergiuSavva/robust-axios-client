import { AxiosMock } from '../helpers/axios-mock';
import RobustAxiosFactory, {
  RobustAxiosConfig,
  ServerError,
  NetworkError,
  TimeoutError,
  RateLimitError,
} from '../../src';
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'; // Added InternalAxiosRequestConfig

describe('RobustAxiosClient - Custom Error Handling', () => {
  let axiosMock: AxiosMock;

  beforeEach(() => {
    axiosMock = new AxiosMock();
  });

  afterEach(() => {
    axiosMock.reset();
  });

  const baseClientConfig: RobustAxiosConfig = {
    baseURL: 'https://example.com',
    retry: { maxRetries: 0 }, // Disable retries for these error tests
  };

  const createAxiosError = (
    status: number,
    code?: string,
    configOverride?: Partial<AxiosRequestConfig>,
    responseOverride?: Partial<AxiosResponse>, // Changed here
  ): AxiosError => {
    // Base config can be partial, ensure headers are properly formed for InternalAxiosRequestConfig
    const tempHeaders = new axios.AxiosHeaders();
    if (configOverride?.headers) {
        // Iterate over headers if they are an object, otherwise AxiosHeaders handles strings etc.
        if (typeof configOverride.headers === 'object' && !Array.isArray(configOverride.headers) && !(configOverride.headers instanceof axios.AxiosHeaders)) {
            for (const key in configOverride.headers) {
                if (Object.prototype.hasOwnProperty.call(configOverride.headers, key)) {
                    const value = configOverride.headers[key];
                    if (value !== undefined && value !== null) { // AxiosHeaders set method expects defined values
                         tempHeaders.set(key, value as axios.AxiosHeaderValue);
                    }
                }
            }
        } else if (configOverride.headers instanceof axios.AxiosHeaders) {
             configOverride.headers.forEach((value, key) => tempHeaders.set(key,value));
        } else {
            // Fallback for other header types, though less common for overrides
            // This might need more specific handling if complex header types are used in overrides
        }
    }
    
    const internalConfig: InternalAxiosRequestConfig = {
      url: configOverride?.url ?? 'https://example.com/api/test',
      method: configOverride?.method ?? 'GET',
      headers: tempHeaders, // tempHeaders is now a defined AxiosHeaders instance
      ...configOverride, // Spread the rest of configOverride, but headers is now from tempHeaders
      // Re-assign headers to ensure it's the one we constructed, overriding any from configOverride again.
      headers: tempHeaders,
    };

    return {
      isAxiosError: true,
      name: 'AxiosError',
      message: code ? `Request failed with code ${code}` : `Request failed with status code ${status}`,
      config: internalConfig, 
      code: code,
      response: {
        data: responseOverride?.data ?? { error: 'details' },
        status: responseOverride?.status ?? status,
        statusText: responseOverride?.statusText ?? `Status ${status}`,
        headers: responseOverride?.headers ?? new axios.AxiosHeaders(), // Response headers can be simple
        config: internalConfig, // Crucially, this config must also be InternalAxiosRequestConfig
        ...responseOverride, 
      },
      toJSON: () => ({}),
    };
  };
  
  const networkErrorWithoutResponse: AxiosError = {
      isAxiosError: true,
      name: 'AxiosError',
      message: 'Network Error',
      config: { 
          url: 'https://example.com/api/test', 
          method: 'GET', 
          headers: new axios.AxiosHeaders() // This ensures headers are AxiosRequestHeaders
      } as InternalAxiosRequestConfig, 
      code: 'ENETUNREACH', 
      response: undefined, 
      toJSON: () => ({}),
  };


  test('Scenario 1: Custom handler returns a new generic Error', async () => {
    axiosMock.mockError('/api/test', networkErrorWithoutResponse);
    
    const client = RobustAxiosFactory.create({
      ...baseClientConfig,
      customErrorHandler: (error: unknown) => {
        if (axios.isAxiosError(error) && !error.response) { // error.response is fine on AxiosError
          return new Error('Custom: Network problem occurred');
        }
        return new Error('Custom: An unknown error occurred');
      },
    });

    try {
      await client.get('/api/test');
      fail('Should have thrown an error');
    } catch (e: unknown) {
      // If customErrorHandler returns a new generic Error, this error is then processed by the library.
      // If the new error is not an AxiosError, it will be returned as is, or wrapped if not an Error instance.
      // The initial check in `handleError` is `if (processedError instanceof SpecificLibraryError) return processedError;`
      // Then `if (isAxiosError(processedError))`
      // Finally `if (processedError instanceof Error)`
      // So a new Error('...') should be returned as is.
      expect(e).toBeInstanceOf(Error); // Should be the direct error from custom handler
      expect((e as Error).message).toBe('Custom: Network problem occurred');
      // It should NOT be classified as NetworkError if the custom handler returns a new generic Error.
      expect(e).not.toBeInstanceOf(NetworkError); 
    }
  });

  test('Scenario 2: Custom handler returns a specific library error (RateLimitError)', async () => {
    axiosMock.mockError('/api/test', createAxiosError(429)); // Original is a 429

    const client = RobustAxiosFactory.create({
      ...baseClientConfig,
      customErrorHandler: (_error: unknown) => {
        return new RateLimitError('Custom rate limit from handler');
      },
    });

    try {
      await client.get('/api/test');
      fail('Should have thrown an error');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).message).toBe('Custom rate limit from handler');
      // Ensure it's the exact instance
      expect((e as RateLimitError).name).toEqual('RateLimitError');
    }
  });
  
  test('Scenario 2b: Custom handler returns a specific library error (ServerError)', async () => {
    axiosMock.mockError('/api/test', createAxiosError(400)); // Original is a 400

    const client = RobustAxiosFactory.create({
      ...baseClientConfig,
      customErrorHandler: (_error: unknown) => {
        return new ServerError('Custom server error from handler', 503);
      },
    });

    try {
      await client.get('/api/test');
      fail('Should have thrown an error');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(ServerError);
      expect((e as ServerError).message).toBe('Custom server error from handler');
      expect((e as ServerError).statusCode).toBe(503);
    }
  });


  test('Scenario 3: Custom handler modifies error by reference and returns original', async () => {
    const originalAxiosError = createAxiosError(500);
    axiosMock.mockError('/api/test', originalAxiosError);

    const client = RobustAxiosFactory.create({
      ...baseClientConfig,
      customErrorHandler: (error: unknown) => {
        if (axios.isAxiosError(error)) {
          // Modifying by reference
          error.message = 'Modified by custom handler';
        }
        // Must return an error instance
        return error instanceof Error ? error : new Error(String(error)); 
      },
    });

    try {
      await client.get('/api/test');
      fail('Should have thrown an error');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(ServerError); // Classified based on original status code
      expect((e as ServerError).message).toBe('Modified by custom handler');
      expect((e as ServerError).statusCode).toBe(500);
    }
  });
  
  test('Scenario 3b: Custom handler logs and returns void (implicitly undefined)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const originalAxiosError = createAxiosError(503);
    axiosMock.mockError('/api/test', originalAxiosError);

    const client = RobustAxiosFactory.create({
      ...baseClientConfig,
      customErrorHandler: (error: unknown) => {
        console.log('Custom handler logged:', (error as Error).message);
        // To satisfy the type (error: unknown) => Error, we must return an error.
        // If the intent is that the library uses the original error if handler returns void,
        // then the library's handleError needs to check for undefined return from customErrorHandler.
        // For now, adhering to the type:
        return error instanceof Error ? error : new Error(String(error));
      },
    });

    try {
      await client.get('/api/test');
      fail('Should have thrown an error');
    } catch (e: unknown) {
      // Since the customErrorHandler now returns the original error (after logging),
      // the library's classification logic will proceed as if the custom handler just observed.
      expect(e).toBeInstanceOf(ServerError); 
      expect((e as ServerError).message).toBe('Request failed with status code 503'); 
      expect((e as ServerError).statusCode).toBe(503);
      expect(consoleSpy).toHaveBeenCalledWith('Custom handler logged: Request failed with status code 503');
    }
    consoleSpy.mockRestore();
  });

  test('Scenario 4: No custom handler - NetworkError', async () => {
    axiosMock.mockError('/api/test', networkErrorWithoutResponse);
    const client = RobustAxiosFactory.create(baseClientConfig);

    try {
      await client.get('/api/test');
      fail('Should have thrown an error');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(NetworkError);
      // Default message for ENETUNREACH might be specific, or generic like "Network error occurred: Network Error"
      expect((e as NetworkError).message).toMatch(/Network error occurred|ENETUNREACH/i);
    }
  });

  test('Scenario 4: No custom handler - ServerError', async () => {
    axiosMock.mockError('/api/test', createAxiosError(500));
    const client = RobustAxiosFactory.create(baseClientConfig);

    try {
      await client.get('/api/test');
      fail('Should have thrown an error');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(ServerError);
      expect((e as ServerError).statusCode).toBe(500);
      expect((e as ServerError).message).toBe('Request failed with status code 500');
    }
  });
  
  test('Scenario 4: No custom handler - TimeoutError (ECONNABORTED)', async () => {
    axiosMock.mockError('/api/test', createAxiosError(0, 'ECONNABORTED', { timeout: 100 }));
     const client = RobustAxiosFactory.create({ ...baseClientConfig, timeout: 100 });

    try {
      await client.get('/api/test');
      fail('Should have thrown an error');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(TimeoutError);
      expect((e as TimeoutError).message).toContain('timed out after 100ms');
    }
  });
});
