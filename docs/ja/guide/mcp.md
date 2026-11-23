---
description: 'Vue で MCP（Model Context Protocol）サーバーを使う：mcpTools で任意の MCP サーバーのツールを useChat と createLLMHandler 用のツールに変換。'
---

# MCP

[MCP](https://modelcontextprotocol.io)（Model Context Protocol）は、モデルにツールを提供するための標準的な仕組みです。検索、ファイル、GitHub、データベースなど、[数百種類のツール](https://github.com/modelcontextprotocol/servers)があります。`vue-llm/mcp` の `mcpTools` は接続済みの MCP クライアントを受け取り、そのサーバーのツールを通常の vue-llm のツールに変換します。これにより、モデルは `useChat` や `createLLMHandler` の中でそれらを呼び出せます。

## セットアップ {#setup}

vue-llm は公式 SDK のクライアントを使いますが、バンドルはしていません。vue-llm と一緒にインストールしてください：

```bash
npm i @modelcontextprotocol/sdk
```

## サーバー上で {#on-the-server}

MCP サーバーが API キーを必要とする場合や、ローカル（stdio）で動作する場合は、MCP をサーバー上で実行します。ハンドラーが自らツールを呼び出し、結果をブラウザにストリーミングします：

```ts
// server/api/chat.post.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createOpenAI } from 'vue-llm/providers'
import { createLLMHandler } from 'vue-llm/server'
import { mcpTools } from 'vue-llm/mcp'

const client = new Client({ name: 'my-app', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` } },
}))

const handler = createLLMHandler({
  provider: createOpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
  model: 'gpt-4o',
  tools: await mcpTools(client),
})

export default defineEventHandler(event => handler(toWebRequest(event)))
```

ローカルの MCP サーバーには、代わりに stdio で接続します：

```ts
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

await client.connect(new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', './docs'],
}))
```

クライアント側は何も変わりません。[`createProxyProvider`](./server) を使った `useChat` は、各 MCP 呼び出しを結果付きの `tool-call` パーツとして表示し、[`MessageParts`](./components#messageparts) や [DevTools](./devtools) も他のツールと同じように表示します。

## ブラウザで {#in-the-browser}

シークレットを必要としない公開 MCP サーバーは、`useChat` から直接使えます。その場合、サーバーが CORS であなたのオリジンを許可し、`Mcp-Session-Id` ヘッダーを公開している必要があります。

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { useChat } from 'vue-llm'
import { mcpTools } from 'vue-llm/mcp'

const client = new Client({ name: 'my-app', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp')))

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: await mcpTools(client),
})
```

`useChat` は、[`execute` を持つツール](./tool-calling)と同様に呼び出しを実行し、結果をモデルに送って会話を続けます。チャットを停止すると、進行中の MCP 呼び出しは中断されます。

## オプション {#options}

```ts
await mcpTools(client, {
  include: ['search', 'fetch'], // only these tools
  exclude: ['delete_file'],     // or everything except these
  prefix: 'github',             // github_search, github_fetch…
})
```

| オプション | 説明 |
|--------|-------------|
| `include` | 指定したツールのみ（MCP サーバー上の名前で指定） |
| `exclude` | 指定したツールを除外する |
| `prefix` | 各名前の前に `prefix_name` の形で付加される。複数のサーバーのツールを組み合わせるときに使う。 |
| `signal` | ツール一覧の取得をキャンセルする |

複数のサーバーのツールを 1 つのリストにまとめることもできます：

```ts
tools: [
  ...await mcpTools(github, { prefix: 'github' }),
  ...await mcpTools(docs, { prefix: 'docs' }),
  getWeather,
]
```

## 結果 {#results}

- ツールが `structuredContent` を返した場合、モデルはそのオブジェクトを受け取ります。
- テキストのみを返した場合、モデルはそのテキストを受け取ります。
- その他のコンテンツ（画像、リソース）は、MCP の content 配列としてそのまま渡されます。
- ツールがエラーを報告した場合（`isError`）、呼び出しはツールのメッセージとともに `error` 状態で終了し、モデルは回復を試みることができます。

プロバイダーがツール名に使えない文字（英字、数字、`_`、`-` 以外のすべて）は `_` に置き換えられます。MCP サーバーは常に元の名前で呼び出されます。

## セキュリティ {#security}

MCP サーバーのツールは、そのサーバーに与えたアクセス権限で実行されます。サーバーを接続する前に：

- 信頼できるサーバーだけを接続してください。ツールの説明や結果はモデルに渡されるため、モデルに向けた指示（プロンプトインジェクション）が含まれている可能性があります。
- `include` を使い、チャットに必要なツールだけを公開してください。サーバーが書き込みや削除を行える場合は特に重要です。
- MCP サーバー用のトークンはサーバー側に保管してください。ブラウザのクライアントに渡したものはすべてユーザーから見えます。
