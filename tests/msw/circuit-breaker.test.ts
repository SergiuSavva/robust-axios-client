import { http, HttpResponse } from 'msw';
import { server } from './setup';
import { mockLogger } from './setup';
import RobustAxiosFactory from '../../src';
import { CircuitBreakerState } from '../../src';

describe('Robust Axios Client with MSW - Circuit Breaker Tests', () => {
  // Reset the handlers after each test
  afterEach(() => {
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
}); 