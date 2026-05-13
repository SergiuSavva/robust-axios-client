import { CircuitBreakerState, RetryConfig } from '../types';

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
          this.requestCount = 1;
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
    switch (this.state) {
      case 'CLOSED':
        this.failures = 0;
        break;
      case 'HALF_OPEN':
        this.successCount++;
        if (this.successCount >= this.config.halfOpenMaxRequests) {
          this.transitionTo('CLOSED');
        }
        break;
    }
  }

  recordFailure() {
    switch (this.state) {
      case 'CLOSED':
        this.failures++;
        if (this.failures >= this.config.failureThreshold) {
          this.transitionTo('OPEN');
        }
        break;
      case 'HALF_OPEN':
        // Single failure in HALF_OPEN reverts immediately to OPEN
        // without waiting for the global failure threshold.
        this.transitionTo('OPEN');
        break;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  private transitionTo(newState: CircuitBreakerState) {
    this.state = newState;
    this.lastStateChange = Date.now();
    this.failures = 0;
    this.requestCount = 0;
    this.successCount = 0;
    this.onStateChange?.(newState);
  }
}
