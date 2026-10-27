---
description: '用中间件包装任意 LLM 提供方，实现日志、请求头、重试、限流以及自定义的请求或流处理。'
---

# 中间件

`wrapProvider` 返回一个应用了中间件的提供方。中间件按数组顺序执行。

```ts
import { wrapProvider, loggingMiddleware, headerMiddleware, retryMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  loggingMiddleware('chat'),
  headerMiddleware({ 'x-team': 'support' }),
  retryMiddleware(),
])
```

## 内置中间件 {#built-in-middleware}

| 中间件 | 说明 |
|------------|-------------|
| `loggingMiddleware(label?)` | 记录请求、结束原因和错误 |
| `headerMiddleware(headers)` | 添加 `providerOptions.headers` |
| `retryMiddleware(options?)` | 以退避策略重新发送失败的请求，参阅 [重试](./retries-rate-limiting) |
| `rateLimitMiddleware(options)` | 客户端请求队列，参阅 [限流](./retries-rate-limiting#client-side-rate-limiting) |

## 编写中间件 {#writing-middleware}

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

| 钩子 | 签名 | 用途 |
|------|-----------|---------|
| `beforeRequest` | `(request, provider) => request` | 改写请求 |
| `wrapChat` | `(next, request) => Promise<result>` | 调用提供方零次或多次（重试、队列、缓存） |
| `afterStream` | `(chunk, request) => chunk \| null` | 转换或丢弃流中的 chunk |
| `onError` | `(error, request) => Error \| void` | 替换或观察错误 |
| `onFinish` | `(request, result) => void` | 在流返回后调用一次 |

`wrapChat` 以洋葱模型组合：数组中的第一个中间件位于最外层。
