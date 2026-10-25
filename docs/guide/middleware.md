# Middleware

`wrapProvider` returns a provider with middleware applied. Middleware runs in array order.

```ts
import { wrapProvider, loggingMiddleware, headerMiddleware, retryMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  loggingMiddleware('chat'),
  headerMiddleware({ 'x-team': 'support' }),
  retryMiddleware(),
])
```

## Built-in middleware

| Middleware | Description |
|------------|-------------|
| `loggingMiddleware(label?)` | Logs requests, finish reasons and errors |
| `headerMiddleware(headers)` | Adds `providerOptions.headers` |
| `retryMiddleware(options?)` | Re-sends failed requests with backoff — see [Retries](./retries-rate-limiting) |
| `rateLimitMiddleware(options)` | Client-side request queue — see [Rate Limiting](./retries-rate-limiting#client-side-rate-limiting) |

## Writing middleware

```ts
import type { Middleware } from 'vue-llm'

const redact: Middleware = {
  beforeRequest(request) {
    return {
      ...request,
      messages: request.messages.map(m =>
        typeof m.content === 'string' ? { ...m, content: m.content.replace(/\d{16}/g, '[card]') } : m),
    }
  },
}
```

| Hook | Signature | Use for |
|------|-----------|---------|
| `beforeRequest` | `(request, provider) => request` | Rewrite the request |
| `wrapChat` | `(next, request) => Promise<result>` | Call the provider zero or more times (retries, queues, caching) |
| `afterStream` | `(chunk, request) => chunk \| null` | Transform or drop stream chunks |
| `onError` | `(error, request) => Error \| void` | Replace or observe errors |
| `onFinish` | `(request, result) => void` | Called once the stream is returned |

`wrapChat` composes like an onion: the first middleware in the array is the outermost.
