import { AxiosRequestConfig, AxiosHeaders } from 'axios';

// HTTP methods that RFC 9110 defines as idempotent. POST and PATCH are
// not, so retrying them risks duplicate writes unless the caller opts
// in by sending an Idempotency-Key header.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/**
 * True if retrying the request cannot cause a duplicate side effect.
 * Either the method is intrinsically idempotent, or the request carries
 * an Idempotency-Key the server is expected to honor (Stripe pattern).
 */
export function isRetrySafe(config: AxiosRequestConfig | undefined): boolean {
  if (!config) return false;
  const method = (config.method ?? 'GET').toUpperCase();
  if (SAFE_METHODS.has(method)) return true;
  return hasIdempotencyKey(config.headers);
}

function hasIdempotencyKey(headers: AxiosRequestConfig['headers']): boolean {
  if (!headers) return false;
  // AxiosHeaders (v1+) supports .has() with case-insensitive matching.
  if (headers instanceof AxiosHeaders) {
    return headers.has(IDEMPOTENCY_KEY_HEADER);
  }
  // Plain object: iterate and compare case-insensitively.
  for (const key of Object.keys(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === IDEMPOTENCY_KEY_HEADER) {
      const value = (headers as Record<string, unknown>)[key];
      return value !== undefined && value !== null && value !== '';
    }
  }
  return false;
}
