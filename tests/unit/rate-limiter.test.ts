import { TokenBucketRateLimiter } from '../../src/utils/rate-limiter';

describe('TokenBucketRateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('admits up to maxRequests tokens before any refill', async () => {
    const limiter = new TokenBucketRateLimiter(3, 1000);
    await expect(limiter.tryAcquire()).resolves.toBe(true);
    await expect(limiter.tryAcquire()).resolves.toBe(true);
    await expect(limiter.tryAcquire()).resolves.toBe(true);
    await expect(limiter.tryAcquire()).resolves.toBe(false);
  });

  it('refills proportionally to elapsed time', async () => {
    const limiter = new TokenBucketRateLimiter(4, 1000); // 0.004 tokens / ms
    for (let i = 0; i < 4; i++) await limiter.tryAcquire();
    await expect(limiter.tryAcquire()).resolves.toBe(false);

    jest.advanceTimersByTime(250); // 1 token's worth
    await expect(limiter.tryAcquire()).resolves.toBe(true);
    await expect(limiter.tryAcquire()).resolves.toBe(false);
  });

  it('does not overfill beyond maxRequests', async () => {
    const limiter = new TokenBucketRateLimiter(2, 1000);
    jest.advanceTimersByTime(10_000); // well past any refill horizon
    await expect(limiter.tryAcquire()).resolves.toBe(true);
    await expect(limiter.tryAcquire()).resolves.toBe(true);
    await expect(limiter.tryAcquire()).resolves.toBe(false);
  });

  it('treats windowMs as the time to fully refill from empty', async () => {
    const limiter = new TokenBucketRateLimiter(5, 1000);
    for (let i = 0; i < 5; i++) await limiter.tryAcquire();
    jest.advanceTimersByTime(1000);
    for (let i = 0; i < 5; i++) {
      await expect(limiter.tryAcquire()).resolves.toBe(true);
    }
    await expect(limiter.tryAcquire()).resolves.toBe(false);
  });
});
