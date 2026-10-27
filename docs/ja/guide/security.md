---
description: 'LLM の API キーをブラウザーに置かないために：サーバープロキシ、dangerouslyAllowBrowser、モデル出力の安全な Markdown レンダリング、レート制限。'
---

# セキュリティ

API キーが必要なプロバイダーは、ブラウザーでの実行を拒否します。

```ts
// Throws: "API keys must not be used in the browser…"
const ai = createOpenAI({ apiKey: 'sk-...' })
```

明示的に許可するのは、プロトタイプや信頼できる環境（Electron や社内ツールなど）に限ってください。

```ts
const ai = createOpenAI({ apiKey: 'sk-...', dangerouslyAllowBrowser: true })
```

## 本番環境での構成 {#production-setup}

キーはサーバーに置き、クライアントからはプロキシプロバイダーを通じてサーバーと通信します。

```ts
// server: /api/chat
import { createLLMHandler } from 'vue-llm/server'
import { createOpenAI } from 'vue-llm/providers'

export const handler = createLLMHandler({
  provider: createOpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
  model: 'gpt-4o',
  rateLimit: { maxRequests: 20, interval: 60_000 },
})
```

```ts
// client
import { createProxyProvider } from 'vue-llm/server'

const { messages, sendMessage } = useChat({ provider: createProxyProvider('/api/chat'), model: 'gpt-4o' })
```

[サーバーとプロキシ](./server) と [Nuxt](./nuxt) も参照してください。

::: tip
サーバーハンドラーはリクエストボディの `model` と `system` を受け付けます。クライアントに選ばせたくない場合は、`onRequest` で固定してください。
:::
