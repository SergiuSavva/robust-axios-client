import { RobustAxiosClient } from '../../src/core/RobustAxiosClient';
import { DEFAULT_TIMEOUT_MS } from '../../src/constants';

describe('default timeout', () => {
  it('applies DEFAULT_TIMEOUT_MS when the user does not set a timeout', () => {
    const client = new RobustAxiosClient({ baseURL: 'https://example.com' });
    expect(client.getInstance().defaults.timeout).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('respects a user-provided timeout', () => {
    const client = new RobustAxiosClient({ baseURL: 'https://example.com', timeout: 5000 });
    expect(client.getInstance().defaults.timeout).toBe(5000);
  });

  it('honors explicit `timeout: 0` (opt-out into infinite)', () => {
    const client = new RobustAxiosClient({ baseURL: 'https://example.com', timeout: 0 });
    expect(client.getInstance().defaults.timeout).toBe(0);
  });

  it('exports DEFAULT_TIMEOUT_MS at a sensible value', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(120_000);
  });
});
