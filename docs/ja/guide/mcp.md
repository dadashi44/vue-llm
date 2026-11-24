---
description: 'Vue で MCP（Model Context Protocol）サーバーを使う：mcpTools で任意の MCP サーバーのツールを useChat と createLLMHandler 用のツールに変換し、useMCP と useMCPServers でユーザーが自分のサーバーを接続できるようにする。'
---

# MCP

[MCP](https://modelcontextprotocol.io)（Model Context Protocol）は、モデルにツールを提供するための標準的な仕組みです。検索、ファイル、GitHub、データベースなど、[数百種類のツール](https://github.com/modelcontextprotocol/servers)があります。`vue-llm/mcp` の `mcpTools` は接続済みの MCP クライアントを受け取り、そのサーバーのツールを通常の vue-llm のツールに変換します。これにより、モデルは `useChat` や `createLLMHandler` の中でそれらを呼び出せます。 ユーザーごとにチャットから自分のサーバー（Notion、Linear など）を接続できるようにするには、[ユーザーが自分のサーバーを接続できるようにする](#let-users-connect-their-own-servers)を参照してください。

## セットアップ {#setup}

`mcpTools` は公式 SDK のクライアントを使いますが、vue-llm はそれをバンドルしていません。vue-llm と一緒にインストールしてください（`useMCP` と `useMCPServers` には不要です）：

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

## ユーザーが自分のサーバーを接続できるようにする {#let-users-connect-their-own-servers}

`mcpTools` は、あなたが選んだサーバーをあなたの認証情報で接続します。`useMCP` と `useMCPServers` を使うと、チャットを使う一人ひとりが*自分の* MCP サーバー（自分の Notion、自分の Linear）を接続できます。Claude や ChatGPT でコネクタを追加できるのと同じ仕組みです。ユーザーが「接続」をクリックし、ポップアップでプロバイダーにサインインすると、チャットにそのサーバーのツールが加わります。そのために vue-llm は独自の MCP クライアントを備えているので、`@modelcontextprotocol/sdk` は不要です。

### 2 つのモード {#two-modes}

フロントエンドの API はどちらも同じで、モードはアプリ単位で選びます。

| | ブラウザーモード | サーバーモード |
|---|---|---|
| 有効にする方法 | `useMCPServers({ catalog })` | `useMCPServers({ server: '/api/mcp' })` + バックエンドの `createMCPConnector` |
| MCP サーバーと通信するのは | ユーザーのブラウザー | あなたのバックエンド |
| ユーザーのトークン | ブラウザーのストレージ（デフォルトは `localStorage`） | あなたのストア（データベース、KV）に暗号化して保存 |
| アプリの XSS の影響を受ける | 受ける | 受けない。ブラウザーはプロバイダーのトークンを一切見ない |
| バックエンドが必要か | 不要 | 必要（チャットにはモデルの API キーのために、たいていすでにある） |
| 動作するサーバー | サインインと CORS がブラウザーから動くもの。Notion と Linear で検証済み。Hugging Face と DeepWiki はブラウザーからのアクセスを確認済み | バックエンドでサインインを完了できる Streamable HTTP サーバー。`createMCPConnector` で Notion と DeepWiki を手動で検証済み（2026 年 11 月）。GitHub は独自の OAuth アプリが必要で、動作する見込みだがまだ検証していない |
| ツールが実行される場所 | ブラウザーの `useChat` | サーバーの `createLLMHandler` |

本番ではサーバーモードを使ってください。ブラウザーモードは、バックエンドがないときの手軽な出発点です。

### ブラウザーモード {#browser-mode}

#### コールバックページ {#the-callback-page}

サインイン後、プロバイダーはポップアップをアプリ内のページにリダイレクトします。デフォルトは `/mcp/callback` です。このページで `handleMCPCallback()` を呼ぶと、結果がチャットのウィンドウに渡され、ポップアップが閉じます。Vue Router の場合：

```ts
// router.ts
{ path: '/mcp/callback', component: () => import('./McpCallback.vue') }
```

```vue
<!-- McpCallback.vue (in Nuxt: pages/mcp/callback.vue) -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { handleMCPCallback } from 'vue-llm/mcp'

onMounted(() => handleMCPCallback())
</script>

<template>
  <p>Signing in…</p>
</template>
```

同じオリジンのページならどれでも使えます。たとえば静的な `public/mcp/callback.html` です：

```html
<script type="module">
  import { handleMCPCallback } from 'https://cdn.jsdelivr.net/npm/vue-llm@1/dist/mcp.js'
  handleMCPCallback()
</script>
```

別のパスにしたいときは `callbackUrl` を使い、そのパスは変えないでください。アプリが登録されるとき、プロバイダーがその URL を記憶します。

#### 複数のサーバー：`useMCPServers` {#several-servers-usemcpservers}

`useMCPServers` はサーバーのリストを管理します。あなたが定義したカタログをユーザーがオン・オフでき、`allowCustom` を指定すると、ユーザーが URL でサーバーを追加することもできます。`vue-llm/mcp` の `mcpServers` には、Notion、Linear、Hugging Face、DeepWiki、GitHub のプリセットがあります（[ブラウザーで動作するサーバー](#which-servers-work-in-the-browser)を参照）。

```ts
import { ref } from 'vue'
import { useChat, useMCPServers } from 'vue-llm'
import { mcpServers } from 'vue-llm/mcp'

const connectors = useMCPServers({
  catalog: [
    mcpServers.notion,
    mcpServers.linear,
    mcpServers.huggingface,
    { id: 'docs', name: 'DeepWiki', url: 'https://mcp.deepwiki.com/mcp' },
  ],
  allowCustom: true,
})

const chat = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: () => [...connectors.tools.value, getWeather],
})

const newUrl = ref('')
```

`tools` には、オンになっていて `ready` 状態のすべてのサーバーのツールが入ります。各ツール名はサーバーの id で始まる（`notion_search`、`linear_create_issue`）ため、サーバー同士で名前が衝突することはありません。`useChat` はリクエストのたびにこのリストを読むので、サーバーが接続された時点でツールが現れます。

リストの表示方法は自由です：

```vue
<template>
  <ul>
    <li v-for="server in connectors.list.value" :key="server.id">
      {{ server.name }} <small>{{ server.url }}</small>

      <button v-if="!server.enabled" @click="connectors.enable(server.id)">Turn on</button>
      <template v-else>
        <button v-if="server.state === 'needs-auth'" @click="connectors.authorize(server.id)">Sign in</button>
        <span v-else-if="server.state === 'authorizing'">
          Waiting for sign-in…
          <a v-if="server.authUrl" :href="server.authUrl" target="_blank">open the sign-in page</a>
        </span>
        <span v-else-if="server.state === 'ready'">{{ server.tools.length }} tools</span>
        <span v-else-if="server.state === 'failed'">{{ server.error?.message }}</span>
        <button @click="connectors.disable(server.id)">Turn off</button>
      </template>

      <button v-if="server.custom" @click="connectors.remove(server.id)">Remove</button>
    </li>
  </ul>

  <form @submit.prevent="connectors.add({ url: newUrl })">
    <input v-model="newUrl" placeholder="https://mcp.example.com/mcp">
    <button>Add server</button>
  </form>
</template>
```

| メソッド | 動作 |
|--------|-------------|
| `enable(id)` | サーバーをオンにし、保存済みの認証情報で接続します。ポップアップは開きません。サインインが必要な場合、状態は `needs-auth` になります。 |
| `authorize(id)` | サインインのポップアップを開きます（サーバーもオンになります）。クリックの中で呼んでください。ブラウザーは、後から開かれたポップアップをブロックします。 |
| `disable(id)` | サーバーをオフにします。サインインは保持されます。 |
| `add({ url, name? })` | URL でサーバーを追加し（`allowCustom` が必要）、ホストから作られた id（`mcp.example.com` → `example`）を返します。`https://` のみで、開発用に `http://localhost` も使えます。無効な URL では例外を投げず、エントリが理由付きで `failed` になります。すでにリストにある URL は、二重に追加せずそのサーバーの id を返します。追加できるサーバーは最大 20 個、URL は 2048 文字まで、名前は 100 文字までです。 |
| `remove(id)` | ユーザーが追加したサーバーを、そのトークンとともに削除します。カタログのサーバーはオフにすることしかできません。 |
| `refresh()` | オンのサーバーすべてに再接続します。 |

`list` の各項目には `id`、`name`、`url`、`custom`、`enabled`、`state`、`error`、`authUrl`、`tools` があります。どのサーバーがオンか、ユーザーがどのサーバーを追加したかは、トークンと同じストレージに保存されます。

状態は `idle`（オフ）、`connecting`、`needs-auth`、`authorizing`（ポップアップが開いている）、`ready`、`failed` です。ブラウザーがポップアップをブロックした場合、状態は `authorizing` のままで、`authUrl` にサインイン用の URL が入ります。上の例のようにリンクとして表示してください。

オプション：`catalog`、`allowCustom`（デフォルトは `false`）、`callbackUrl`、`clientName`（プロバイダーの同意画面に表示されます。デフォルトは `document.title`）、`storage`。

#### ツールを絞り込む {#limiting-tools}

オンになっているすべてのサーバーのすべてのツールが、説明と入力スキーマとともにモデルに渡されます。Notion（77 ツール）と Linear（70 ツール）だけで、OpenAI の 1 リクエストあたり 128 ツールという上限をすでに超えますし、スキーマはターンごとにプロンプトのトークンを消費します。カタログのエントリに `include`（これらのツールだけ）または `exclude`（これら以外すべて）を指定してください。名前は MCP サーバー上のツール名です：

```ts
const connectors = useMCPServers({
  catalog: [
    { ...mcpServers.notion, include: ['notion-search', 'notion-fetch'] },
    { id: 'docs', url: 'https://mcp.example.com/mcp', exclude: ['delete_page'] },
  ],
})
```

サーバーモードでは、コネクターの `servers` に同じように設定します。そちらではフロントエンドの catalog はフィルタリングに使われません。ユーザーが追加したサーバーでは、すべてのツールが使われます。

#### 1 つのサーバー：`useMCP` {#one-server-usemcp}

サーバーが 1 つだけなら、`useMCP` で同じ状態を直接取得できます：

```ts
import { useMCP } from 'vue-llm'

const notion = useMCP({ url: 'https://mcp.notion.com/mcp', prefix: 'notion' })

useChat({ provider: ai, model: 'gpt-4o', tools: () => notion.tools.value })
```

```vue
<button v-if="notion.state.value === 'needs-auth'" @click="notion.authorize()">Connect Notion</button>
```

| オプション | 説明 |
|--------|-------------|
| `url` | サーバーの Streamable HTTP エンドポイント |
| `prefix`、`include`、`exclude` | [`mcpTools`](#options) と同じ |
| `autoConnect` | マウント時に保存済みの認証情報で接続します。デフォルトは `true`。ポップアップは開きません。 |
| `callbackUrl` | デフォルトは `${location.origin}/mcp/callback` |
| `clientName` | プロバイダーの同意画面に表示されます。デフォルトは `document.title` |
| `storage` | `'local'`（デフォルト）、`'session'`、`'memory'`、または独自のアダプター |

戻り値は `state`、`tools`、`error`、`authUrl`、`serverInfo`（サーバーが返す名前とバージョン）、そして `connect()`、`authorize()`、`disconnect()`（セッションを閉じ、サインインは保持）、`logout()` です。

`logout()`（および `useMCPServers` の `remove()`）は、ユーザーのサインインを破棄します。トークンは削除されます。アプリのプロバイダーへの登録は残るので、次回のサインインで再登録されることはありません。

#### ブラウザーで動作するサーバー {#which-servers-work-in-the-browser}

ブラウザーモードでは、ブラウザー自身が MCP サーバー、そのサインインのメタデータ、登録エンドポイント、トークンエンドポイントを呼び出します。これが動くのは、サーバーが CORS で許可していて、動的クライアント登録と PKCE に対応している場合だけです。

- 実際のサインインで検証済み：**Notion** と **Linear**。
- ブラウザーからのアクセス（CORS とサインインのメタデータ）を確認済み：**Hugging Face** と **DeepWiki**（DeepWiki はサインイン不要）。
- 2026 年 11 月時点で、次のサーバーはブラウザーからのアクセスを許可していません。これらにはサーバーモードを使ってください：GitHub（動的クライアント登録なし、トークンエンドポイントに CORS なし）、Vercel と Stripe（MCP エンドポイントに CORS なし）、Asana（MCP エンドポイントに CORS なし、動的登録なし）、Atlassian（CORS が `Authorization` ヘッダーを許可していない）。

サーバーがブラウザーをブロックすると、エントリは `MCPUnsupportedServerError` で失敗し、サーバーモードを案内するメッセージが付きます。ブラウザーモードでは、`mcpServers.github` はリストに `failed` と表示されます。

「サインイン」ボタンを出す前に、まずサーバーを接続させてください（`autoConnect` または `enable()`）。そうすれば、ブラウザーをブロックするサーバーはすぐに `failed` と表示され、ユーザーが無駄にサインインするポップアップが開くことがなくなります。

#### トークンの保存先 {#where-tokens-are-kept}

`storage` は、トークン、クライアント登録、リストの保存先を決めます：

- `'local'`（デフォルト）— `localStorage`。ユーザーは次回以降もサインインしたままです。
- `'session'` — `sessionStorage`。タブを閉じるとサインアウトされます。
- `'memory'` — 何も保存されません。リロードするとサインアウトされます。
- 独自のアダプター：`{ get(key), set(key, value), remove(key) }`。同期でも非同期でも構いません。

ブラウザーのストレージにあるトークンは、ページ上のどのスクリプトからも読み取れます。アプリに XSS の脆弱性があると、トークンが漏れます。より厳格な構成には `'session'` か `'memory'` を使うか、ブラウザーがトークンを受け取らないサーバーモードを使ってください。

### サーバーモード {#server-mode}

`vue-llm/server` の `createMCPConnector` は、サインインと MCP の接続をバックエンドで行います。トークンはあなたのストアに暗号化して保存され、ブラウザーには届きません。ツールは [`createLLMHandler`](./server#server-tools) で実行され、その呼び出しはこれまでどおり `useChat` にストリーミングされます。Nuxt の例：

```ts
// server/utils/mcp.ts
import { createMCPConnector } from 'vue-llm/server'
import { mcpServers } from 'vue-llm/mcp'

export const mcp = createMCPConnector({
  basePath: '/api/mcp',
  publicUrl: 'https://app.example.com',
  servers: [mcpServers.notion, mcpServers.linear, mcpServers.deepwiki],
  user: request => getUserId(request), // your auth: a stable user id, or null when signed out
  store: useStorage('mcp'),
  secret: process.env.MCP_SECRET, // generate with: openssl rand -base64 32
})
```

```ts
// server/api/mcp/[...path].ts
export default defineEventHandler(event => mcp.handler(toWebRequest(event)))
```

```ts
// server/api/chat.post.ts
import { createOpenAI } from 'vue-llm/providers'
import { createLLMHandler } from 'vue-llm/server'

const handler = createLLMHandler({
  provider: createOpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
  model: 'gpt-4o',
  tools: request => mcp.toolsFor(request),
})

export default defineEventHandler(event => handler(toWebRequest(event)))
```

`toolsFor(request)` は、そのユーザーがオンにして接続済みのサーバーのツールを返します。失敗したサーバーや再サインインが必要なサーバーはスキップされるので、チャットが壊れることはありません。

フロントエンドでは、catalog の代わりに `server` を渡します。リストはバックエンドから取得されます：

```ts
import { useChat, useMCPServers } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'

const connectors = useMCPServers({ server: '/api/mcp' })

const chat = useChat({
  provider: createProxyProvider('/api/chat'),
  onFinish: () => connectors.refresh(),
})
```

同じテンプレートがそのまま使えます。ツールはサーバーで実行されるため、`connectors.tools` は空のままです。リストは `refresh()` を呼んだとき、ウィンドウにフォーカスが戻ったとき、サインインの後に再読み込みされます。`onFinish` で `refresh()` を呼ぶと、回答中にスキップされたサーバー（たとえば再サインインが必要なもの）がその直後に表示されます。オフのサーバーは `idle` と表示されます。1 つのサーバーだけなら `useMCP({ id: 'notion', server: '/api/mcp' })` を使います。

API が cookie ではなく bearer トークンを使う場合は、`headers`（プレーンなオブジェクト、ref、またはゲッター）を渡してください。独自の `fetch` が必要なら、それも渡せます。`credentials` のデフォルトは `'include'` です。

サーバーモードでは、コールバックページを自分で書く必要はありません。コネクターが `${publicUrl}${basePath}/callback` で配信します。このページ自体はサインインを完了しません。プロバイダーのレスポンスを、自分を開いたウィンドウに渡すだけで、`useMCP` / `useMCPServers` がそれをユーザーのセッションとともに `POST {server}/servers/:id/complete` に送ります。ポップアップは opener を保持している必要があります。`publicUrl` がフロントエンドと同じオリジンなら、`BroadcastChannel` メッセージも送られます。

| オプション | 説明 |
|--------|-------------|
| `basePath` | `handler` をマウントする場所。たとえば `'/api/mcp'` |
| `publicUrl` | 必須。アプリの絶対オリジン。サインインのコールバックは `${publicUrl}${basePath}/callback` で、リクエストヘッダーから取得されることはありません。 |
| `allowedOrigins` | ルートの呼び出しを許可するフロントエンドのオリジン（認証情報付きの CORS、CSRF チェック）。デフォルトは `publicUrl` のオリジン |
| `servers` | すべてのユーザーがオンにできるカタログ：プリセット、または `{ id, url, name?, oauth? }`。それぞれに `include` / `exclude` を指定できます（[ツールを絞り込む](#limiting-tools)を参照） |
| `user` | 必須。リクエストに対応するサインイン済みユーザーの id を返します。未サインインなら `null`（ルートは 401 を返します） |
| `store` | トークン、登録、各ユーザーのリストの保存先：`get`/`set`/`remove` を持つものなら何でも、同期でも非同期でも構いません。Nitro の `useStorage()` や unstorage はそのまま使えます。 |
| `secret` | 保存するすべての値を暗号化します（AES-GCM）。`NODE_ENV` が `production` のときは必須です。開発中は、指定しないと値が平文で保存され、警告がログに出ます。`openssl rand -base64 32` でランダムな値を生成し、コードには書かず環境変数に置いてください。 |
| `allowCustom` | ユーザーが URL でサーバーを追加できるようにします。デフォルトは `false`。1 ユーザーあたり最大 20 個、URL は 2048 文字まで、名前は 100 文字までです（超えると 400）。ユーザーのリストにすでにある URL には、そのサーバーの `id` を付けて 409 を返します。[セキュリティに関する注意](#security-notes)を参照。 |
| `allowHosts` | ユーザーが追加したサーバーとそのサインインに許可するホストのパターン（`example.com`、`*.example.com`） |
| `timeout` | 1 つのサーバーへの接続の制限時間（ミリ秒）。デフォルトは `10000`。それより遅いサーバーはスキップされ、エラーとして表示されます。 |
| `clientName` | プロバイダーの同意画面に表示されます。デフォルトは `publicUrl` のホスト |
| `fetch` | すべての外向きリクエストに使われます |

#### GitHub {#github}

サーバーモードでの GitHub は動作する見込みですが、vue-llm ではまだ検証していません。GitHub の MCP サーバーには動的クライアント登録がないため、OAuth アプリは自分で登録してください。GitHub で **Settings → Developer settings → OAuth Apps → New OAuth App** を開き、コールバック URL を `${publicUrl}${basePath}/callback`（上の例では `https://app.example.com/api/mcp/callback`）にします。そのうえで、その認証情報を渡します：

```ts
servers: [
  mcpServers.notion,
  {
    ...mcpServers.github,
    oauth: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scopes: ['…'], // optional: the GitHub scopes the tools you use need
    },
  },
],
```

同じ `oauth` オプションは、事前登録済みのクライアントを必要とするどのサーバーでも使えます。

### セキュリティに関する注意 {#security-notes}

- **ユーザーが追加したサーバーは、モデルが送る内容を見られ、モデルに返答もできます。** ユーザーが追加したサーバーは、モデルがそのサーバーに行うツール呼び出しを受け取り、そのツールの説明と結果はモデルに渡されるため、プロンプトインジェクションを試みる可能性があります。ユーザーがサインインする前にサーバーのホストを表示し（上のテンプレートのように）、不要なら `allowCustom` をオフのままにしてください。
- **サーバーモードは、ユーザーが選んだ URL を取得します**（`allowCustom`）。コネクターは `https://` のみを受け付け、ループバック、プライベート、リンクローカル、クラウドのメタデータのアドレスは常に拒否し、リダイレクトもすべて検査します。そのうえで：
  - 本番では `allowHosts` を設定してください。許可するサーバーのホストと、そのサインインが使うホスト（認可サーバー）の*両方*を列挙します。そうしないと、そのサインインは拒否されます。
  - `allowHosts` がない場合、各ホストは `node:dns`（Node、Bun、Deno）で名前解決され、プライベートなアドレスが 1 つでもあれば拒否されます。この検査では DNS rebinding を排除できません。これも `allowHosts` を設定すべき理由の 1 つです。
  - `node:dns` のないエッジランタイム（Cloudflare Workers、edge functions）では、`allowCustom` に `allowHosts` が必要です。ない場合、サーバーの追加は、その旨を伝えるエラーで失敗します。
- **サインインのメタデータは正確でなければなりません。** プロバイダーの認可サーバーのメタデータにある `issuer` は、認可サーバーの URL と完全に一致している必要があります（RFC 8414）。ここを誤っているサーバーにはサインインできません。
- サーバーモードでは、ルートは `Origin` ヘッダーを `allowedOrigins` と照合し（ヘッダーのない変更系リクエストは拒否されます）、サインイン済みの `user` を要求します。プロバイダーのトークンがブラウザーへのレスポンスに含まれることはありません。
- **サインインは、それを開始したユーザーに紐づきます。** コールバックページは、プロバイダーのレスポンスを opener に渡すだけです。バックエンドがトークンを保存するのは、`POST /servers/:id/complete` が、`authorize` を呼んだのと同じ `user`（かつ同じサーバー）から来たときだけです。誰かが自分のサインインリンクを別の人に送っても、その人のアカウントが送信者のユーザーに紐づくことはありません。
