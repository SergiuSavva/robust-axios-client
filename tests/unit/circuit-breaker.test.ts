import { CircuitBreaker } from '../../src/utils/circuit-breaker';
import { CircuitBreakerState } from '../../src/types';

const cbConfig = (overrides: Partial<{ failureThreshold: number; resetTimeout: number; halfOpenMaxRequests: number }> = {}) => ({
  failureThreshold: 3,
  resetTimeout: 1000,
  halfOpenMaxRequests: 2,
  ...overrides,
});

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('CLOSED state', () => {
    it('admits requests', async () => {
      const cb = new CircuitBreaker(cbConfig());
      await expect(cb.beforeRequest()).resolves.toBe(true);
      expect(cb.getState()).toBe('CLOSED');
    });

    it('opens after failureThreshold consecutive failures', async () => {
      const states: CircuitBreakerState[] = [];
      const cb = new CircuitBreaker(cbConfig({ failureThreshold: 3 }), (s) => states.push(s));

      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('CLOSED');
      cb.recordFailure();
      expect(cb.getState()).toBe('OPEN');
      expect(states).toEqual(['OPEN']);
    });

    it('resets failure count on a successful request', async () => {
      const cb = new CircuitBreaker(cbConfig({ failureThreshold: 3 }));

      cb.recordFailure();
      cb.recordFailure();
      cb.recordSuccess(); // resets counter
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('CLOSED');
      cb.recordFailure();
      expect(cb.getState()).toBe('OPEN');
    });
  });

  describe('OPEN state', () => {
    it('rejects requests until resetTimeout has elapsed', async () => {
      const cb = new CircuitBreaker(cbConfig({ failureThreshold: 1, resetTimeout: 1000 }));
      cb.recordFailure();
      expect(cb.getState()).toBe('OPEN');

      await expect(cb.beforeRequest()).resolves.toBe(false);

      jest.advanceTimersByTime(999);
      await expect(cb.beforeRequest()).resolves.toBe(false);

      jest.advanceTimersByTime(1);
      await expect(cb.beforeRequest()).resolves.toBe(true);
      expect(cb.getState()).toBe('HALF_OPEN');
    });

    it('counts the transition request as the first HALF_OPEN probe', async () => {
      const cb = new CircuitBreaker(cbConfig({ failureThreshold: 1, resetTimeout: 1000, halfOpenMaxRequests: 1 }));
      cb.recordFailure();
      jest.advanceTimersByTime(1000);

      await expect(cb.beforeRequest()).resolves.toBe(true); // transition + first probe
      await expect(cb.beforeRequest()).resolves.toBe(false); // cap already reached
    });
  });

  describe('HALF_OPEN state', () => {
    const enterHalfOpen = (cb: CircuitBreaker) => {
      cb.recordFailure();
      jest.advanceTimersByTime(1000);
    };

    it('admits up to halfOpenMaxRequests probes', async () => {
      const cb = new CircuitBreaker(cbConfig({ failureThreshold: 1, resetTimeout: 1000, halfOpenMaxRequests: 2 }));
      enterHalfOpen(cb);

      await expect(cb.beforeRequest()).resolves.toBe(true);  // probe 1 (transition)
      await expect(cb.beforeRequest()).resolves.toBe(true);  // probe 2
      await expect(cb.beforeRequest()).resolves.toBe(false); // capped
      expect(cb.getState()).toBe('HALF_OPEN');
    });

    it('transitions to CLOSED only after halfOpenMaxRequests successes', async () => {
      const states: CircuitBreakerState[] = [];
      const cb = new CircuitBreaker(
        cbConfig({ failureThreshold: 1, resetTimeout: 1000, halfOpenMaxRequests: 3 }),
        (s) => states.push(s)
      );
      enterHalfOpen(cb);

      await cb.beforeRequest();
      cb.recordSuccess();
      expect(cb.getState()).toBe('HALF_OPEN');

      await cb.beforeRequest();
      cb.recordSuccess();
      expect(cb.getState()).toBe('HALF_OPEN');

      await cb.beforeRequest();
      cb.recordSuccess();
      expect(cb.getState()).toBe('CLOSED');

      expect(states).toEqual(['OPEN', 'HALF_OPEN', 'CLOSED']);
    });

    it('reverts to OPEN on a single failure (regardless of failureThreshold)', async () => {
      const states: CircuitBreakerState[] = [];
      // failureThreshold high (5) so this can only succeed if HALF_OPEN handles failure specially.
      const cb = new CircuitBreaker(
        cbConfig({ failureThreshold: 5, resetTimeout: 1000, halfOpenMaxRequests: 3 }),
        (s) => states.push(s)
      );

      // Force OPEN by sending 5 failures.
      for (let i = 0; i < 5; i++) cb.recordFailure();
      jest.advanceTimersByTime(1000);

      await cb.beforeRequest(); // enter HALF_OPEN
      cb.recordFailure();        // single failure → OPEN

      expect(cb.getState()).toBe('OPEN');
      expect(states).toEqual(['OPEN', 'HALF_OPEN', 'OPEN']);
    });

    it('after reopening from HALF_OPEN, resetTimeout starts fresh', async () => {
      const cb = new CircuitBreaker(cbConfig({ failureThreshold: 1, resetTimeout: 500, halfOpenMaxRequests: 1 }));
      cb.recordFailure();
      jest.advanceTimersByTime(500);

      await cb.beforeRequest(); // HALF_OPEN
      cb.recordFailure();        // → OPEN

      // Even though 500ms+ have elapsed since the first OPEN, the new OPEN
      // resets the timer; another full resetTimeout must pass.
      await expect(cb.beforeRequest()).resolves.toBe(false);
      jest.advanceTimersByTime(499);
      await expect(cb.beforeRequest()).resolves.toBe(false);
      jest.advanceTimersByTime(1);
      await expect(cb.beforeRequest()).resolves.toBe(true);
    });
  });
});
