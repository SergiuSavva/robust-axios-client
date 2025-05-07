import { CircuitBreakerState, RetryConfig } from '../types';

// Circuit breaker implementation
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failures: number = 0;
  private lastStateChange: number = Date.now();
  private requestCount: number = 0;

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
          return true;
        }
        return false;
      case 'HALF_OPEN':
        return this.requestCount < this.config.halfOpenMaxRequests;
      default:
        return false;
    }
  }

  recordSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED');
    }
    this.failures = 0;
    this.requestCount = 0;
  }

  recordFailure() {
    this.failures++;
    if (this.failures >= this.config.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(newState: CircuitBreakerState) {
    this.state = newState;
    this.lastStateChange = Date.now();
    this.onStateChange?.(newState);
  }
}
