---
description: '使用指数退避和 Retry-After 重试失败的 LLM 请求，并在客户端和服务端对请求进行限流。'
---

# 重试与限流

## 错误 {#errors}

对于非 2xx 响应，提供方会抛出 `LLMAPIError`：

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

| 属性 | 说明 |
|----------|-------------|
| `status` | HTTP 状态码 |
| `provider` | `'openai'`、`'anthropic'`、`'google'`、`'ollama'` 或 `'proxy'` |
| `body` | 原始响应体 |
| `retryAfter` | 来自 `retry-after-ms` / `Retry-After` 的毫秒数 |
| `isRetryable` | 对于 408、409、429 和 5xx 为 `true` |

## 重试 {#retries}

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

- 会重试 `isRetryable` 的 `LLMAPIError` 以及网络错误（来自 `fetch` 的 `TypeError`）。
- 等待 `initialDelay * factor^(attempt-1)`，或服务器给出的 `Retry-After`，上限为 `maxDelay`。
- 中止请求（例如 `stop()`）会立即取消等待。
- 只会重试初始请求，流开始之后发生的错误不会重试。
- 可以通过 `shouldRetry(error, attempt)` 覆盖重试策略。

## 客户端限流 {#client-side-rate-limiting}

```ts
import { rateLimitMiddleware } from 'vue-llm'

const ai = wrapProvider(provider, [
  retryMiddleware(),
  rateLimitMiddleware({ maxRequests: 20, interval: 60_000, maxConcurrent: 2 }),
])
```

超出限制的请求会在队列中等待。当响应流结束或被取消时，会释放一个并发槽位。中止一个正在排队的请求会直接 reject，而不会调用提供方。

请将 `retryMiddleware` 放在 `rateLimitMiddleware` 之前，这样每次重试也都会经过限流器。

## 服务端限流 {#server-side-rate-limiting}

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

超出限制时，处理器会返回 `429` 并附带 `Retry-After` 响应头。`createProxyProvider` 会将其转换为 `LLMAPIError`，因此客户端的 `retryMiddleware` 会自动等待并重试。

::: info
服务端限流器在每个实例的内存中保存计数。如果有多个实例，请在处理器前面放置一个共享的限流器（例如基于 Redis 的）。
:::
