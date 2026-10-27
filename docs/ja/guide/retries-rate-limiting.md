---
description: '失敗した LLM リクエストを指数バックオフと Retry-After でリトライし、クライアントとサーバーの両方でリクエストのレートを制限します。'
---

# リトライとレート制限

## エラー {#errors}

プロバイダーは 2xx 以外のレスポンスに対して `LLMAPIError` をスローします。

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

| プロパティ | 説明 |
|----------|-------------|
| `status` | HTTP ステータス |
| `provider` | `'openai'`、`'anthropic'`、`'google'`、`'ollama'`、`'proxy'` のいずれか |
| `body` | レスポンスボディ（生データ） |
| `retryAfter` | `retry-after-ms` / `Retry-After` から得たミリ秒 |
| `isRetryable` | 408、409、429、5xx の場合に `true` |

## リトライ {#retries}

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

- `isRetryable` が真の `LLMAPIError` と、ネットワークエラー（`fetch` からの `TypeError`）をリトライします。
- `initialDelay * factor^(attempt-1)`、またはサーバーの `Retry-After` の分だけ待機します。上限は `maxDelay` です。
- リクエストを中断すると（`stop()` など）、待機はすぐにキャンセルされます。
- リトライされるのは最初のリクエストのみです。ストリームが始まった後のエラーはリトライされません。
- ポリシーは `shouldRetry(error, attempt)` で上書きできます。

## クライアントサイドのレート制限 {#client-side-rate-limiting}

```ts
import { rateLimitMiddleware } from 'vue-llm'

const ai = wrapProvider(provider, [
  retryMiddleware(),
  rateLimitMiddleware({ maxRequests: 20, interval: 60_000, maxConcurrent: 2 }),
])
```

上限を超えたリクエストはキューで待機します。同時実行のスロットは、レスポンスのストリームが終了するかキャンセルされたときに解放されます。キューで待機中のリクエストを中断すると、プロバイダーを呼び出さずに reject されます。

`retryMiddleware` を `rateLimitMiddleware` より前に置くと、リトライもすべてリミッターを通るようになります。

## サーバーサイドのレート制限 {#server-side-rate-limiting}

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

上限を超えると、ハンドラーは `Retry-After` ヘッダー付きの `429` を返します。`createProxyProvider` はこれを `LLMAPIError` に変換するため、クライアントサイドの `retryMiddleware` が自動的に待機してリトライします。

::: info
サーバーのリミッターは、インスタンスごとにメモリー上でカウンターを保持します。複数のインスタンスで動かす場合は、共有のリミッター（Redis ベースなど）をハンドラーの前段に置いてください。
:::
