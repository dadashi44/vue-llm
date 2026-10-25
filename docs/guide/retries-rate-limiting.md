# Retries & Rate Limiting

## Errors

Providers throw `LLMAPIError` for non-2xx responses:

```ts
import { LLMAPIError } from 'vue-llm'

useChat({
  provider: ai,
  model: 'gpt-4o',
  onError(error) {
    if (error instanceof LLMAPIError && error.status === 429) {
      toast(`Rate limited, retry in ${error.retryAfter ?? '?'} ms`)
    }
  },
})
```

| Property | Description |
|----------|-------------|
| `status` | HTTP status |
| `provider` | `'openai'`, `'anthropic'`, `'google'`, `'ollama'` or `'proxy'` |
| `body` | Raw response body |
| `retryAfter` | Milliseconds from `retry-after-ms` / `Retry-After` |
| `isRetryable` | `true` for 408, 409, 429 and 5xx |

## Retries

```ts
import { wrapProvider, retryMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  retryMiddleware({
    maxRetries: 3,       // default 3
    initialDelay: 1000,  // default 1000 ms
    factor: 2,           // default 2
    maxDelay: 30_000,    // default 30 s
    jitter: true,        // default true — random 50–100% of the delay
    onRetry: ({ attempt, delay, error }) => console.warn(`retry #${attempt} in ${delay}ms`, error),
  }),
])
```

- Retries `LLMAPIError`s with `isRetryable` and network errors (`TypeError` from `fetch`).
- Waits `initialDelay * factor^(attempt-1)`, or the server's `Retry-After`, capped at `maxDelay`.
- Aborting the request (e.g. `stop()`) cancels the wait immediately.
- Only the initial request is retried — errors after the stream has started are not.
- Override the policy with `shouldRetry(error, attempt)`.

## Client-side rate limiting

```ts
import { rateLimitMiddleware } from 'vue-llm'

const ai = wrapProvider(provider, [
  retryMiddleware(),
  rateLimitMiddleware({ maxRequests: 20, interval: 60_000, maxConcurrent: 2 }),
])
```

Requests over the limit wait in a queue. A concurrency slot is released when the response stream ends or is cancelled. Aborting a queued request rejects it without calling the provider.

Put `retryMiddleware` before `rateLimitMiddleware` so every retry also goes through the limiter.

## Server-side rate limiting

```ts
import { createLLMHandler } from 'vue-llm/server'

export const handler = createLLMHandler({
  provider,
  rateLimit: {
    maxRequests: 10,
    interval: 60_000,
    key: req => req.headers.get('x-user-id') ?? 'anonymous', // default: x-forwarded-for / x-real-ip
  },
})
```

Over the limit, the handler responds `429` with a `Retry-After` header. `createProxyProvider` turns it into an `LLMAPIError`, so a client-side `retryMiddleware` waits and retries automatically.

::: info
The server limiter keeps counters in memory per instance. For multiple instances, put a shared limiter (e.g. Redis-backed) in front of the handler.
:::
