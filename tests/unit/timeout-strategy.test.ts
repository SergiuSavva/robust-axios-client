import { RobustAxiosClient } from '../../src/core/RobustAxiosClient';

// `calculateNextTimeout` is private, but its policy is interesting enough
// to test directly. A thin test subclass exposes it.
class TestableClient extends RobustAxiosClient {
  callNextTimeout(current: number, retry: number): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this as any).calculateNextTimeout(current, retry);
  }
}

const make = (strategy: 'reset' | 'grow' | 'fixed' | 'decay', multiplier = 1.5) =>
  new TestableClient({
    baseURL: 'https://example.com',
    retry: { timeoutStrategy: strategy, timeoutMultiplier: multiplier },
  });

describe("timeoutStrategy ('grow' canonical, 'decay' deprecated alias)", () => {
  it("'grow' multiplies the timeout by `timeoutMultiplier ^ retryCount`", () => {
    const c = make('grow', 2);
    expect(c.callNextTimeout(1_000, 0)).toBe(1_000);
    expect(c.callNextTimeout(1_000, 1)).toBe(2_000);
    expect(c.callNextTimeout(1_000, 3)).toBe(8_000);
  });

  it("'decay' is an alias of 'grow' (back-compat)", () => {
    const grow = make('grow', 1.5);
    const decay = make('decay', 1.5);
    for (const retry of [0, 1, 2, 3, 4]) {
      expect(decay.callNextTimeout(1_000, retry)).toBe(grow.callNextTimeout(1_000, retry));
    }
  });

  it("'reset' and 'fixed' both leave the timeout unchanged", () => {
    const reset = make('reset');
    const fixed = make('fixed');
    expect(reset.callNextTimeout(2_500, 5)).toBe(2_500);
    expect(fixed.callNextTimeout(2_500, 5)).toBe(2_500);
  });

  it('the default strategy is now `grow` (not the misnamed `decay`)', () => {
    const c = new TestableClient({ baseURL: 'https://example.com' });
    // Default `timeoutMultiplier` is 1.5 -> retryCount=2 -> 2.25x.
    expect(c.callNextTimeout(1_000, 2)).toBeCloseTo(2_250, 5);
  });
});
