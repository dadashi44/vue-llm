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
      case 'final': return { type: 'message-metadata', metadata: d } // summary, chart…
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
| `mapEvent` | `({ event, data, json, id }) => chunk \| chunk[] \| null` | 1 つの SSE イベントを変換する。`response` でヘッダーを読める。デフォルトでは data がすでに vue-llm のチャンクであるとみなす |
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

## バックエンドのセッション {#sessions-on-the-backend}

多くのバックエンドは履歴を自分で保持し（セッションや会話の id ごと）、新しいメッセージだけを受け取ります。そのために必要な情報は各リクエストに含まれます。

| リクエストのフィールド | 値 |
|---|---|
| `trigger` | `'submit'`：新しいユーザーメッセージ。`'regenerate'`：`regenerate()` が呼ばれた。`'continue'`：ツールの結果をモデルに返す。 |
| `messageId` | `submit` では新しいユーザーメッセージの id。`regenerate` では置き換えられるアシスタントメッセージの id で、バックエンドはこれを削除できます。 |

クライアントでデータベースの id を使うには、回答を `message-start` チャンクで始めます。これがアシスタントメッセージの id を設定し、`regenerate` 時にはその id が `messageId` としてバックエンドに届きます。

```ts
const provider = createSSEProvider({
  url: req => `/api/sessions/${sessionId.value}/ask`,
  body: req => ({
    message: req.messages.at(-1)?.content, // the backend keeps the history
    regenerate: req.trigger === 'regenerate' ? req.messageId : undefined,
  }),
  mapEvent: ({ event, json, response }) => {
    const d = json as any
    switch (event) {
      case 'start': return { type: 'message-start', id: d.message_id } // or response.headers.get('X-Message-Id')
      // …
    }
  },
})

const { messages, sendMessage, regenerate } = useChat({
  provider,
  model: 'default',
  id: sessionId, // a ref: switching it loads that session
  storage: {
    load: async id => (await api.getMessages(id)).map(toUIMessage),
    save: () => {}, // the backend saves on its own
    remove: () => {},
  },
})
```

`id` を ref で渡すとセッションを切り替えられます。進行中の回答は停止し、新しいセッションの履歴が読み込まれます。[永続化](./persistence#switching-chats)を参照してください。

## メッセージのメタデータ {#message-metadata}

回答に属するがテキストではないデータ（データベースの id、出典、グラフ、コストなど）は `message-metadata` チャンクで送ります。

```ts
{ type: 'message-metadata', metadata: { messageId: 42, summary: '…' } }
```

`useChat` はこれをアシスタントメッセージの `metadata` にマージします。ストリーム中に複数届いてもよく、後から届いたキーが前の値を置き換えます。ほかのフィールドと同じように表示できます。

```vue
<ChartFromAi v-if="message.metadata?.chart" :chart="message.metadata.chart" />
```

メタデータは `onFinish` に渡されるメッセージにも含まれ、[永続化](./persistence)でも保存されます。`createLLMHandler` のストリームはこれらのチャンクをそのまま `createProxyProvider` に渡します。

## サーバーで vue-llm を使う場合 {#with-vue-llm-on-the-server}

バックエンドが JavaScript なら、`createLLMHandler` にツールを実行させることができます。[サーバーツール](./server#server-tools) を参照してください。そのストリームはすでに vue-llm のプロトコルに沿っているため、クライアントに必要なのは `createProxyProvider` だけです。
