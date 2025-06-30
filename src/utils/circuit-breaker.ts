import { CircuitBreakerState, RetryConfig } from '../types';

// Circuit breaker implementation
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failures: number = 0;
  private lastStateChange: number = Date.now();
  private requestCount: number = 0;
  private successCount: number = 0;

  constructor(
    private readonly config: Required<RetryConfig>['circuitBreaker'],
    private readonly onStateChange?: (state: CircuitBreakerState) => void
  ) {}

  async beforeRequest(): Promise<boolean> {
    switch (this.state) {
      case 'CLOSED':
        return true;
      case 'OPEN':
        if (Date.now() - this.lastStateChange >= this.config.resetTimeout) {
          this.transitionTo('HALF_OPEN');
          this.requestCount = 0; // Reset request count when entering HALF_OPEN
          this.successCount = 0; // Reset success count when entering HALF_OPEN
          return true;
        }
        return false;
      case 'HALF_OPEN':
        if (this.requestCount < this.config.halfOpenMaxRequests) {
          this.requestCount++;
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  recordSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      // Only transition to CLOSED after all test requests have succeeded
      if (this.successCount >= this.config.halfOpenMaxRequests) {
        this.transitionTo('CLOSED');
        this.requestCount = 0; // Reset counters when transitioning to CLOSED
        this.successCount = 0;
      }
    }
    this.failures = 0;
  }

  recordFailure() {
    this.failures++;
    if (this.failures >= this.config.failureThreshold) {
      this.transitionTo('OPEN');
      this.requestCount = 0; // Reset counters when opening circuit
      this.successCount = 0;
    }
  }

  private transitionTo(newState: CircuitBreakerState) {
    this.state = newState;
    this.lastStateChange = Date.now();
    this.onStateChange?.(newState);
  }
}
