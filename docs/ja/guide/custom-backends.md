---
description: 'createSSEProvider を使い、Server-Sent Events をストリーミングする既存のバックエンドに useChat を接続します。独自のイベント形式を vue-llm のチャンクに変換できます。'
---

# カスタムバックエンド

多くのアプリには、すでに LLM と通信するバックエンドがあります。そこではセッションの保存、ビジネスコンテキストの注入、データベースに対するツールの実行などが行われています。`createSSEProvider` を使えば、プロトコルを変更せずに `useChat` をそのようなバックエンドに接続できます。

## createSSEProvider

```ts
import { useChat } from 'vue-llm'
import { createSSEProvider } from 'vue-llm/providers'

const provider = createSSEProvider({
  url: req => `/api/ai-chat/sessions/${(req.providerOptions as { sessionId: string }).sessionId}/stream`,
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  body: req => ({ message: req.messages.at(-1)?.content }), // session backends only need the new message
  mapEvent: ({ event, json }) => {
    const d = json as any
    switch (event) {
      case 'thinking': return { type: 'reasoning-delta', text: d.text }
      case 'text_delta': return { type: 'text-delta', text: d.text }
      case 'tool_use': return [
        { type: 'tool-call-start', toolCallId: d.id, toolName: d.name },
        { type: 'tool-call-delta', toolCallId: d.id, args: JSON.stringify(d.input) },
        { type: 'tool-call-end', toolCallId: d.id },
      ]
      case 'tool_result': return { type: 'tool-result', toolCallId: d.tool_use_id, result: d.output }
      case 'error': return { type: 'error', error: new Error(d.message) }
      case 'done': return { type: 'finish', finishReason: 'stop' }
    }
  },
})

const sessionId = ref('s1')
const { messages, sendMessage } = useChat({ provider, model: 'default', body: () => ({ sessionId: sessionId.value }) })
```

| オプション | 型 | 説明 |
|--------|------|-------------|
| `url` | `string \| (request) => string` | エンドポイント。リクエストに応じて変えられる（`providerOptions` に `useChat` の `body` が入る） |
| `method` | `string` | デフォルトは `POST` |
| `headers` | `HeadersInit \| () => HeadersInit \| Promise<HeadersInit>` | 固定値またはリクエストごとの値（最新の認証トークンなど） |
| `credentials` | `RequestCredentials` | Cookie 認証の場合は `'include'` など |
| `body` | `(request) => unknown` | リクエストの JSON。デフォルトは `{ messages, model }` |
| `mapEvent` | `({ event, data, json, id }) => chunk \| chunk[] \| null` | 1 つの SSE イベントを変換する。デフォルトでは data がすでに vue-llm のチャンクであるとみなす |
| `id` / `name` | `string` | `LLMAPIError.provider` とエラーメッセージで使われる |

- `json` は `event.data` を JSON としてパースしたもの（または `undefined`）です。`data: [DONE]` は無視されます。
- イベントをスキップするには `null`/`undefined` を、複数のチャンクを出力するには配列を返します。
- ストリームが `finish` チャンクなしで終了した場合は、自動で追加されます。
- 2xx 以外のレスポンスは [`LLMAPIError`](./retries-rate-limiting#errors) をスローするため、ここでも `retryMiddleware` が使えます。

## サーバーサイドのツール結果 {#server-side-tool-results}

バックエンドが自らツールを実行する場合は、呼び出しの後に `tool-result` チャンクを送出します。

```ts
{ type: 'tool-result', toolCallId: 't1', result: { leader: 'Team A' } }
{ type: 'tool-result', toolCallId: 't1', error: 'Database unavailable' }
```

対応する `tool-call` パーツは `result`（または `error`）に移行し、`useChat` はその呼び出しに対してクライアントサイドの往復を **開始しません**。進捗はパーツの `state` から描画できます：`pending` → （`running`） → `result` / `error`。

::: tip
`tool-call-end` は `tool-result` より先に届くため、`onToolCall` ハンドラーにはサーバーサイドの呼び出しも渡されます。クライアントで処理しないツールには `undefined` を返してください。サーバーの結果がそれを埋めます。
:::

## サーバーで vue-llm を使う場合 {#with-vue-llm-on-the-server}

バックエンドが JavaScript なら、`createLLMHandler` にツールを実行させることができます。[サーバーツール](./server#server-tools) を参照してください。そのストリームはすでに vue-llm のプロトコルに沿っているため、クライアントに必要なのは `createProxyProvider` だけです。
