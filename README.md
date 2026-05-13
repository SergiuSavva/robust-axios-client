# robust-axios-client

[![npm version](https://img.shields.io/npm/v/robust-axios-client.svg)](https://www.npmjs.com/package/robust-axios-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/robust-axios-client.svg)](https://nodejs.org)

**axios with the defaults a senior engineer would have written anyway, and typed errors you can `instanceof` instead of `if (err.response?.status === ...)`.**

A drop-in replacement for `axios.create()` that ships with the configuration you'd reach for the first time you put axios in production — sensible timeouts, idempotency-aware retries with jittered exponential backoff, `Retry-After`-aware throttling, typed error hierarchy, optional circuit breaker and rate limiter.

## Why

Plain `axios.create({})` gives you `timeout: 0` (infinite), no retries, no circuit breaker, no rate limiting, and a single `AxiosError` you have to discriminate by string code and numeric status. You end up writing the same wrapper at every job. This is that wrapper, maintained.

```typescript
// Before — bare axios:
try {
  await axios.get('/users');
} catch (err) {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED') { /* timeout */ }
    else if (!err.response) { /* network */ }
    else if (err.response.status === 429) { /* rate limited */ }
    else if (err.response.status >= 500) { /* server */ }
    else if (err.response.status >= 400) { /* client */ }
  }
}

// After — robust-axios-client:
import RobustAxios, {
  TimeoutError, NetworkError, RateLimitError, ServerError, ClientError,
} from 'robust-axios-client';

try {
  await api.get('/users');
} catch (err) {
  if (err instanceof RateLimitError) { /* ... */ }
  else if (err instanceof ServerError) { /* ... */ }
  else if (err instanceof TimeoutError) { /* ... */ }
  // ...
}
```

## Install

```bash
npm install robust-axios-client
```

The only runtime dependency is `axios`.

## Quick start

```typescript
import RobustAxios from 'robust-axios-client';

const api = RobustAxios.create({ baseURL: 'https://api.example.com' });

const { data } = await api.get<User[]>('/users');
```

That single line buys you a 30-second default timeout, 3 retries on transient failures with jittered exponential backoff, `Retry-After` honored on `429`, typed errors on failure, and sensitive headers sanitized in any logs. All of it overridable.

## What you get for free (defaults)

| Default | Value | Why |
|---|---|---|
| `timeout` | `30_000` ms | axios's `0` (infinite) is the #1 axios footgun. Pass `timeout: 0` to opt back into infinite. |
| `maxRetries` | `3` | Survives transient network blips without amplifying outages. |
| Retry backoff | exponential with equal jitter (`base/2 + random(0, base/2)`) | AWS-style. Smooths thundering herds without unbounded best-case latency. |
| Retry on | network errors, `5xx`, timeouts, `429` | Status `429` is always retried; the others are retried **only for idempotent requests** (see below). |
| Method-aware retries | `GET`/`HEAD`/`OPTIONS`/`PUT`/`DELETE` retried freely; `POST`/`PATCH` only when an `Idempotency-Key` header is present | Prevents the classic duplicate-write bug when a `POST` returns `5xx` after the server processed it. |
| `Retry-After` header | honored on `429` *and* `5xx`, regardless of `backoffStrategy` | The server is the authority on when to be called again. |
| Sensitive log sanitization | `Authorization`, `Cookie`, `Set-Cookie`, etc. redacted in debug logs | Safe-by-default observability. |
| Circuit breaker | enabled with conservative defaults (5 failures / 60 s reset / 3 probe requests) | Prevents cascading failures into a downstream that's already struggling. Pass `retry: { circuitBreaker: undefined }` to disable. |
| Rate limiter | off | Per-deployment, not a sensible default. |
| Full axios API surface | preserved | Drop-in for existing axios code. |

## Typed error hierarchy

Every thrown error is one of these, so you can `instanceof`-discriminate at call sites instead of inspecting `AxiosError` internals:

```
Error
├─ HttpError           // any HTTP-status failure (has .statusCode + .response)
│   ├─ ClientError     //   4xx (excluding the typed cases below)
│   ├─ ServerError     //   5xx
│   ├─ RateLimitError  //   429
│   └─ ValidationError //   422 with validation details
├─ TimeoutError        // request exceeded its timeout (ECONNABORTED / ETIMEDOUT)
├─ NetworkError        // request never reached the server (DNS, TCP, TLS)
└─ CancellationError   // caller aborted the request
```

All are exported from the package root.

## Configuration

Everything is optional. The full schema:

```typescript
const api = RobustAxios.create({
  // —— any axios request option works here ——
  baseURL: 'https://api.example.com',
  timeout: 30_000,                 // override the default
  headers: { 'X-Client': 'foo' },

  // —— retry ——
  retry: {
    maxRetries: 3,
    backoffStrategy: 'exponential', // 'exponential' | 'linear' | 'fibonacci' | 'custom'
    customBackoff: (n, err) => n * 1000,  // when backoffStrategy: 'custom'
    retryCondition: (err) => boolean,     // override the idempotency-aware default
    retryDelay: (n, err) => milliseconds, // override the default delay function

    timeoutStrategy: 'grow',    // 'reset' | 'grow' | 'fixed' — applied between attempts
    timeoutMultiplier: 1.5,     // (`'decay'` is a deprecated alias of `'grow'`)

    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 60_000,
      halfOpenMaxRequests: 3,
    },

    onRetry: (ctx) => { /* attempt callback */ },
    onSuccess: (response, ctx) => { /* eventual success */ },
    onFailed: (error, ctx) => { /* gave up */ },
    onCircuitBreakerStateChange: (state) => { /* CLOSED | OPEN | HALF_OPEN */ },

    // Per-endpoint overrides — see "Request categorization" below.
    requestCategories: { /* ... */ },
  },

  // —— rate limit (off unless set) ——
  rateLimit: { maxRequests: 100, windowMs: 60_000 },

  // —— misc ——
  logger: customLogger,            // implements LoggerInterface
  debug: false,                    // verbose request/response logging
  dryRun: false,                   // simulate without sending
  customErrorHandler: (err) => err,
});
```

### Request categorization

Apply different retry policy per endpoint:

```typescript
RobustAxios.create({
  baseURL: 'https://api.example.com',
  retry: {
    maxRetries: 3,
    requestCategories: {
      auth: {
        matcher: (cfg) => cfg.url?.includes('/auth'),
        settings: { maxRetries: 1, backoffStrategy: 'linear' },
      },
      search: {
        matcher: (cfg) => cfg.url?.startsWith('/search'),
        settings: { maxRetries: 5, backoffStrategy: 'exponential' },
      },
    },
  },
});
```

### Custom logger

```typescript
import { LoggerInterface } from 'robust-axios-client';

class PinoAdapter implements LoggerInterface {
  debug(msg: string, ...args: unknown[]) { logger.debug({ args }, msg); }
  info(msg: string, ...args: unknown[])  { logger.info({ args }, msg); }
  warn(msg: string, ...args: unknown[])  { logger.warn({ args }, msg); }
  error(msg: string, ...args: unknown[]) { logger.error({ args }, msg); }
}

RobustAxios.create({ baseURL: '…', logger: new PinoAdapter() });
```

## API surface

The client is API-compatible with `axios.Axios`. Every method you know from axios — `request`, `get`, `post`, `put`, `patch`, `delete`, `head`, `options`, `getUri`, `interceptors`, etc. — works on instances. The static factory (`RobustAxios.create`, `RobustAxios.all`, `RobustAxios.isCancel`, `RobustAxios.isAxiosError`, …) mirrors the axios top-level API.

| Surface | Symbol |
|---|---|
| Default export | `RobustAxios` — factory + static HTTP methods |
| Named exports | `RobustAxiosClient`, all error classes, `CircuitBreaker`, `TokenBucketRateLimiter`, `ConsoleLogger`, `LoggerInterface`, `RetryConfig`, `RetryContext`, `RobustAxiosConfig`, `CircuitBreakerState`, `DEFAULT_RETRY_CONFIG`, `DEFAULT_TIMEOUT_MS` |

## Changelog

### v1.3.0 — best-practice defaults *(behavior changes)*

- **Default `timeout: 30_000`.** Pass `timeout: 0` to keep the old infinite-timeout behavior (e.g. for long polling or SSE).
- **Retries are now method-aware.** `POST` and `PATCH` are no longer retried on `5xx`, timeouts, or network errors unless the request carries an `Idempotency-Key` header. `429` is always retried. Override with a custom `retryCondition` for the old behavior.
- **Exponential backoff now applies equal jitter** — delay for retry `n` is uniformly distributed in `[2^n × 500ms, 2^n × 1000ms)`. Pick `linear` / `fibonacci` for deterministic delays.
- **`Retry-After` is honored unconditionally** — across any `backoffStrategy`, on both `429` and `5xx`, accepting either `delta-seconds` or `HTTP-date` form.

See `CHANGELOG.md` (if present) for older releases.

## Compatibility

- **Node.js** 18+
- **TypeScript** 4.8+
- ESM and CommonJS dual build
- Axios `^1.16` (peer-compatible with any `1.x` ≥ 1.16)

## License

MIT — see [LICENSE](LICENSE).

## Author

[Sergiu Savva](https://github.com/SergiuSavva)
