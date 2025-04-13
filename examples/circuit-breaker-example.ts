// Example showing circuit breaker functionality
import RobustAxios, { CircuitBreakerState } from '../src';

async function main() {
  // Create client with circuit breaker
  const client = RobustAxios.create({
    baseURL: 'https://jsonplaceholder.typicode.com',
    retry: {
      maxRetries: 2,
      retryDelay: () => 100,
      circuitBreaker: {
        failureThreshold: 3,        // Open circuit after 3 failures
        resetTimeout: 5000,         // Try again after 5 seconds
        halfOpenMaxRequests: 1       // Allow 1 test request when half-open
      },
      onCircuitBreakerStateChange: (newState: CircuitBreakerState) => {
        console.log(`Circuit breaker state changed to: ${newState}`);
      }
    }
  });

  // Make requests in sequence to demonstrate circuit breaker
  async function makeRequest(endpoint: string) {
    try {
      console.log(`Making request to ${endpoint}...`);
      const response = await client.get(endpoint);
      console.log(`Request to ${endpoint} succeeded with status ${response.status}`);
      return response;
    } catch (error) {
      console.error(`Request to ${endpoint} failed:`, error?.message);
      console.error(`Is circuit breaker open?`, error?.message?.includes('Circuit breaker is OPEN'));
      throw error;
    }
  }

  // Create artificial failures with a non-existent endpoint
  const badEndpoint = '/non-existent';
  
  // Try making several failing requests to trigger circuit breaker
  for (let i = 0; i < 5; i++) {
    try {
      await makeRequest(badEndpoint);
    } catch (error) {
      // Continue after errors
      console.log('Continuing after error...');
    }
    
    // Add a small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Now try a valid request
  try {
    await makeRequest('/posts/1');
  } catch (error) {
    console.log('Valid request rejected due to circuit breaker');
  }
  
  // Wait for circuit reset and try again
  console.log('Waiting for circuit breaker to reset...');
  await new Promise(resolve => setTimeout(resolve, 5500));
  
  try {
    await makeRequest('/posts/1');
    console.log('Success! Circuit breaker has reset.');
  } catch (error) {
    console.log('Request still failing after circuit reset');
  }
}

main().catch(console.error); 