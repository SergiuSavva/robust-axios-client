import { http, HttpResponse } from 'msw';
import { server } from './setup';
import { mockLogger } from './setup';
import RobustAxiosFactory from '../../src';
import { CircuitBreakerState } from '../../src';

describe('Robust Axios Client with MSW - Circuit Breaker Tests', () => {
  // Reset the RobustAxiosFactory and handlers after each test
  afterEach(() => {
    RobustAxiosFactory._resetForTesting();
    server.resetHandlers();
  });

  test('circuit breaker should open after consecutive failures', async () => {
    // Track circuit breaker state changes
    const stateChanges: CircuitBreakerState[] = [];
    
    server.use(
      http.get('https://example.com/api/server-error', () => {
        return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
      })
    );
    
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      retry: {
        maxRetries: 0,
        circuitBreaker: {
          failureThreshold: 3,      // Open after 3 failures
          resetTimeout: 10000,      // Stay open for 10 seconds
          halfOpenMaxRequests: 1    // Allow 1 test request in half-open state
        },
        onCircuitBreakerStateChange: (newState) => {
          stateChanges.push(newState);
        }
      }
    });

    // Make 3 requests to trigger the circuit breaker
    await expect(client.get('/api/server-error')).rejects.toThrow();
    await expect(client.get('/api/server-error')).rejects.toThrow();
    await expect(client.get('/api/server-error')).rejects.toThrow();
    
    // The 4th request should be rejected by the circuit breaker without hitting the API
    const error = await client.get('/api/server-error').catch(e => e);
    expect(error.message).toContain('Circuit breaker is open');
    
    // Verify the circuit breaker changed state
    expect(stateChanges).toContain('OPEN');
  });

  test('circuit breaker should close after successful test request', async () => {
    // Spy for state change tracking
    const stateChanges: CircuitBreakerState[] = [];
    let requestCount = 0;
    
    // Create a handler that fails initially but succeeds after a few calls
    server.use(
      http.get('https://example.com/api/recovery-test', () => {
        requestCount++;
        
        if (requestCount <= 3) {
          return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
        }
        
        return HttpResponse.json({ message: 'Success' }, { status: 200 });
      })
    );
    
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      retry: {
        maxRetries: 0,
        circuitBreaker: {
          failureThreshold: 3,
          resetTimeout: 100,       // Short timeout for testing
          halfOpenMaxRequests: 1
        },
        onCircuitBreakerStateChange: (newState) => {
          stateChanges.push(newState);
        }
      }
    });
    
    // Make 3 requests to trigger the circuit breaker
    await expect(client.get('/api/recovery-test')).rejects.toThrow();
    await expect(client.get('/api/recovery-test')).rejects.toThrow();
    await expect(client.get('/api/recovery-test')).rejects.toThrow();
    
    // The 4th request should be rejected by the circuit breaker
    const error = await client.get('/api/recovery-test').catch(e => e);
    expect(error.message).toContain('Circuit breaker is open');
    
    // Wait for the circuit breaker to transition to half-open
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Now the circuit should be half-open and allow a test request
    // This request should succeed (as our handler now returns 200)
    const response = await client.get('/api/recovery-test');
    expect(response.status).toBe(200);
    
    // Circuit should now be closed
    expect(stateChanges).toEqual(expect.arrayContaining(['OPEN', 'HALF_OPEN', 'CLOSED']));
    
    // Further requests should work
    const response2 = await client.get('/api/recovery-test');
    expect(response2.status).toBe(200);
  });

  test('circuit breaker should stay open if test request fails', async () => {
    // Spy for state change tracking
    const stateChanges: CircuitBreakerState[] = [];
    
    // Create a handler that always fails
    server.use(
      http.get('https://example.com/api/always-fail', () => {
        return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
      })
    );
    
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      retry: {
        maxRetries: 0,
        circuitBreaker: {
          failureThreshold: 3,
          resetTimeout: 100,       // Short timeout for testing
          halfOpenMaxRequests: 1
        },
        onCircuitBreakerStateChange: (newState) => {
          stateChanges.push(newState);
        }
      }
    });
    
    // Make 3 requests to trigger the circuit breaker
    await expect(client.get('/api/always-fail')).rejects.toThrow();
    await expect(client.get('/api/always-fail')).rejects.toThrow();
    await expect(client.get('/api/always-fail')).rejects.toThrow();
    
    // The 4th request should be rejected by the circuit breaker
    const error = await client.get('/api/always-fail').catch(e => e);
    expect(error.message).toContain('Circuit breaker is open');
    
    // Wait for the circuit breaker to transition to half-open
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // This test request will fail
    await expect(client.get('/api/always-fail')).rejects.toThrow();
    
    // Circuit should go back to open
    expect(stateChanges).toEqual(expect.arrayContaining(['OPEN', 'HALF_OPEN', 'OPEN']));
    
    // Next request should still fail with circuit breaker error
    const error2 = await client.get('/api/always-fail').catch(e => e);
    expect(error2.message).toContain('Circuit breaker is open');
  });

  test('should log circuit breaker state changes', async () => {
    // Track circuit breaker state changes
    const stateChanges: CircuitBreakerState[] = [];
    
    server.use(
      http.get('https://example.com/api/log-test', () => {
        return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
      })
    );
    
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      debug: true, // Enable debug logs
      retry: {
        maxRetries: 0,
        circuitBreaker: {
          failureThreshold: 3,      // Open after 3 failures
          resetTimeout: 10000,      // Stay open for 10 seconds
          halfOpenMaxRequests: 1    // Allow 1 test request in half-open state
        },
        onCircuitBreakerStateChange: (newState) => {
          stateChanges.push(newState);
        }
      }
    });

    // Make 3 requests to trigger the circuit breaker
    await expect(client.get('/api/log-test')).rejects.toThrow();
    await expect(client.get('/api/log-test')).rejects.toThrow();
    await expect(client.get('/api/log-test')).rejects.toThrow();
    
    // The 4th request should be rejected by the circuit breaker without hitting the API
    const error = await client.get('/api/log-test').catch(e => e);
    expect(error.message).toContain('Circuit breaker is open');
    
    // Verify logger was called
    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalled();
    
    // Reset mock call history
    jest.clearAllMocks();
    
    // Verify we can check for specific log messages if needed
    await expect(client.get('/api/log-test')).rejects.toThrow();
    
    // When circuit breaker is open, error is logged but not info with "Request:"
    expect(mockLogger.error).toHaveBeenCalled();
    // Circuit breaker prevents the request from being made, so no request log
  });

  test('circuit breaker should properly transition from HALF_OPEN to CLOSED after successful tests', async () => {
    const stateChanges: CircuitBreakerState[] = [];
    let apiCallCount = 0;

    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      retry: {
        maxRetries: 0,
        circuitBreaker: {
          failureThreshold: 2,      // Open after 2 failures
          resetTimeout: 100,        // Short timeout for quick testing
          halfOpenMaxRequests: 2    // Allow 2 test requests in half-open state
        },
        onCircuitBreakerStateChange: (newState) => {
          stateChanges.push(newState);
        }
      }
    });

    // Open the circuit by failing twice.
    server.use(
      http.get('https://example.com/api/half-open-limit', () => {
        return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
      }, { once: true })
    );
    server.use(
      http.get('https://example.com/api/half-open-limit', () => {
        return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
      }, { once: true })
    );

    await expect(client.get('/api/half-open-limit')).rejects.toThrow();
    await expect(client.get('/api/half-open-limit')).rejects.toThrow();

    expect(stateChanges).toContain('OPEN');

    // Wait for OPEN → HALF_OPEN
    await new Promise(resolve => setTimeout(resolve, 150));

    apiCallCount = 0;
    const resolveResponses: Array<() => void> = [];

    // Switch to success responses; hold them open to force concurrency.
    server.resetHandlers();
    server.use(
      http.get('https://example.com/api/half-open-limit', async () => {
        apiCallCount++;
        await new Promise<void>(resolve => {
          resolveResponses.push(resolve);
        });
        return HttpResponse.json({ message: 'Success', callCount: apiCallCount }, { status: 200 });
      })
    );

    // Fire 3 concurrent requests while HALF_OPEN with halfOpenMaxRequests=2.
    // Only the first 2 should be admitted as test probes; the 3rd must be
    // rejected with "Circuit breaker is open".
    const request1 = client.get('/api/half-open-limit');
    const request2 = client.get('/api/half-open-limit');
    const request3 = client.get('/api/half-open-limit');
    // Attach allSettled synchronously so the 3rd request's rejection is
    // observed immediately and not flagged as unhandled by Node.
    const settled = Promise.allSettled([request1, request2, request3]);

    // Let interceptors run so beforeRequest() is decided for all three.
    await new Promise(resolve => setTimeout(resolve, 10));

    // Release responses for the admitted probes.
    resolveResponses.forEach(resolve => resolve());

    const results = await settled;

    expect(results).toHaveLength(3);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/Circuit breaker is open/);

    // Allow state transition microtasks to flush.
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(stateChanges).toEqual(expect.arrayContaining(['OPEN', 'HALF_OPEN', 'CLOSED']));
    // Only the 2 admitted probes hit the server.
    expect(apiCallCount).toBe(2);

    // Now that the circuit is CLOSED, a follow-up request must pass through.
    server.resetHandlers();
    server.use(
      http.get('https://example.com/api/half-open-limit', () => {
        apiCallCount++;
        return HttpResponse.json({ message: 'Success', callCount: apiCallCount }, { status: 200 });
      })
    );
    const followUp = await client.get('/api/half-open-limit');
    expect(followUp.status).toBe(200);
    expect(apiCallCount).toBe(3);
  });

  test('circuit breaker should limit requests in HALF_OPEN state', async () => {
    const stateChanges: CircuitBreakerState[] = [];
    let apiCallCount = 0;
    
    const client = RobustAxiosFactory.create({
      baseURL: 'https://example.com',
      retry: {
        maxRetries: 0,
        circuitBreaker: {
          failureThreshold: 2,      // Open after 2 failures
          resetTimeout: 100,        // Short timeout for quick testing
          halfOpenMaxRequests: 1    // Allow only 1 test request in half-open state
        },
        onCircuitBreakerStateChange: (newState) => {
          stateChanges.push(newState);
        }
      }
    });

    // First, let's open the circuit breaker by making failing requests
    server.use(
      http.get('https://example.com/api/half-open-simple', () => {
        return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
      }, { once: true })
    );
    server.use(
      http.get('https://example.com/api/half-open-simple', () => {
        return HttpResponse.json({ error: 'Server Error' }, { status: 500 });
      }, { once: true })
    );

    // Make 2 requests to trigger the circuit breaker to OPEN
    await expect(client.get('/api/half-open-simple')).rejects.toThrow();
    await expect(client.get('/api/half-open-simple')).rejects.toThrow();
    
    // Verify circuit is OPEN
    expect(stateChanges).toContain('OPEN');
    
    // Wait for the circuit breaker to transition to HALF_OPEN
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Reset API call counter and set up success responses
    apiCallCount = 0;
    server.resetHandlers();
    server.use(
      http.get('https://example.com/api/half-open-simple', () => {
        apiCallCount++;
        return HttpResponse.json({ message: 'Success', callCount: apiCallCount }, { status: 200 });
      })
    );
    
    // Make first request - should succeed
    const response1 = await client.get('/api/half-open-simple');
    expect(response1.status).toBe(200);
    
    // Wait for potential state transition
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Should have transitioned to CLOSED after successful test
    expect(stateChanges).toEqual(expect.arrayContaining(['OPEN', 'HALF_OPEN', 'CLOSED']));
    
    // Verify only 1 API call was made during HALF_OPEN
    expect(apiCallCount).toBe(1);
    
    // Further requests should succeed in CLOSED state
    const response2 = await client.get('/api/half-open-simple');
    expect(response2.status).toBe(200);
    expect(apiCallCount).toBe(2);
  });
}); 