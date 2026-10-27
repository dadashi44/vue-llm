---
description: 'createLLMHandler：LLM の呼び出しをプロキシし、サーバーサイドのツールを実行し、IP ごとにレート制限する Web 標準の Request/Response ハンドラー。Nuxt、Node、Bun、Deno、エッジランタイムで動作します。'
---

# サーバーとプロキシ

`vue-llm/server` は任意のプロバイダーをストリーミング HTTP エンドポイントに変え、そのエンドポイントと通信するプロバイダーをブラウザーに提供します。API キーがサーバーの外に出ることはありません。

## createLLMHandler

Web 標準の `(request: Request) => Promise<Response>` ハンドラーを返すため、Node（フレームワーク経由）、Bun、Deno、Cloudflare Workers、Nuxt/Nitro で動作します。

```ts
import { createLLMHandler } from 'vue-llm/server'
import { createAnthropic } from 'vue-llm/providers'

const handler = createLLMHandler({
  provider: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  model: 'claude-sonnet-4-5',
  system: 'You are a helpful assistant.',
  maxMessages: 50,
  rateLimit: { maxRequests: 30, interval: 60_000 },
  onRequest: body => ({ ...body, model: 'claude-sonnet-4-5' }), // pin the model
})

// Bun
Bun.serve({ port: 3000, fetch: req => new URL(req.url).pathname === '/api/chat' ? handler(req) : new Response('Not found', { status: 404 }) })
```

| オプション | 型 | 説明 |
|--------|------|-------------|
| `provider` | `LLMProvider` | 必須 |
| `model` | `string` | デフォルトのモデル（リクエストボディで上書き可能） |
| `system` | `string` | デフォルトのシステムプロンプト（リクエストボディで上書き可能） |
| `tools` | `ServerToolDefinition[]` | モデルに提供するツール。`execute` を持つものはサーバーで実行される |
| `maxToolRoundtrips` | `number` | 1 リクエストあたりのサーバーツールのラウンド数の上限（デフォルト `5`） |
| `maxMessages` | `number` | 直近 N 件のメッセージのみを保持する |
| `rateLimit` | `{ maxRequests, interval?, key? }` | クライアントごとの上限。超過時は `429` + `Retry-After` を返す |
| `onRequest` | `(body) => body` | リクエストボディを検証または書き換える |

リクエストボディは `{ messages: ChatMessage[], model?: string, system?: string }` です。レスポンスは Server-Sent Events で、1 イベントにつき 1 つの `ChatStreamChunk` が送られ、最後は `data: [DONE]` で終わります。ストリーミング開始前のエラーは、ステータス `400`、`405`、`429`、`500` の JSON として返されます。

## サーバーツール {#server-tools}

ツールに `execute` 関数を持たせると、ハンドラーがサーバー上でそれを実行し、結果をモデルに返してストリーミングを続けます。データベースや API キーがブラウザーに見えることはありません。

```ts
const handler = createLLMHandler({
  provider,
  tools: [
    {
      name: 'get_standings',
      description: 'Current standings of a tournament',
      parameters: { type: 'object', properties: { tournament: { type: 'number' } }, required: ['tournament'] },
      async execute(args, { request }) {
        const { tournament } = args as { tournament: number }
        await assertCanRead(request, tournament)
        return db.standings(tournament)
      },
    },
  ],
})
```

クライアントはツール呼び出しに続いて `tool-result` チャンクを受け取るため、`tool-call` パーツはクライアントとの往復なしにそのまま `result` になります。スローされたエラーは `{ type: 'tool-result', error }` になり、モデルにも伝えられるため、モデルは回復したり状況を説明したりできます。

`execute` を持たないツールはクライアントに任されます。ストリームは `finishReason: 'tool-calls'` で終了し、`useChat` が通常どおり `onToolCall` を実行します。1 つのリクエストの中でサーバーツールとクライアントツールを混在させることもできます。

## createProxyProvider

```ts
import { useChat } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'

const { messages, sendMessage } = useChat({
  provider: createProxyProvider('/api/chat'),
  model: 'claude-sonnet-4-5',
})
```

添付ファイル、ツール呼び出し、サーバーツールの結果、推論は、そのままプロキシを通じてストリーミングされます。これは [`createSSEProvider`](./custom-backends) の薄いラッパーです。2xx 以外のレスポンスは `provider: 'proxy'` を持つ `LLMAPIError` になります。

## streamToSSE

レスポンスを自分で組み立てる場合のための低レベルなヘルパーです。

```ts
import { streamToSSE } from 'vue-llm/server'

const { stream } = await provider.chat({ model, messages })
return new Response(streamToSSE(stream), { headers: { 'Content-Type': 'text/event-stream' } })
```
