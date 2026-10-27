---
description: 'ロギング、ヘッダー、リトライ、レート制限、独自のリクエスト処理やストリーム処理のためのミドルウェアで、任意の LLM プロバイダーをラップします。'
---

# ミドルウェア

`wrapProvider` はミドルウェアを適用したプロバイダーを返します。ミドルウェアは配列の順に実行されます。

```ts
import { wrapProvider, loggingMiddleware, headerMiddleware, retryMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  loggingMiddleware('chat'),
  headerMiddleware({ 'x-team': 'support' }),
  retryMiddleware(),
])
```

## 組み込みミドルウェア {#built-in-middleware}

| ミドルウェア | 説明 |
|------------|-------------|
| `loggingMiddleware(label?)` | リクエスト、終了理由、エラーをログに出力する |
| `headerMiddleware(headers)` | `providerOptions.headers` を追加する |
| `retryMiddleware(options?)` | 失敗したリクエストをバックオフ付きで再送する。[リトライ](./retries-rate-limiting) を参照 |
| `rateLimitMiddleware(options)` | クライアントサイドのリクエストキュー。[レート制限](./retries-rate-limiting#client-side-rate-limiting) を参照 |

## ミドルウェアを書く {#writing-middleware}

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

| フック | シグネチャ | 用途 |
|------|-----------|---------|
| `beforeRequest` | `(request, provider) => request` | リクエストを書き換える |
| `wrapChat` | `(next, request) => Promise<result>` | プロバイダーを 0 回以上呼び出す（リトライ、キュー、キャッシュ） |
| `afterStream` | `(chunk, request) => chunk \| null` | ストリームのチャンクを変換または破棄する |
| `onError` | `(error, request) => Error \| void` | エラーを置き換えたり監視したりする |
| `onFinish` | `(request, result) => void` | ストリームが返された時点で一度だけ呼ばれる |

`wrapChat` はタマネギのように合成されます。配列の最初のミドルウェアが一番外側になります。
