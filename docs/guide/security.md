---
description: 'Keep LLM API keys out of the browser: server proxy, dangerouslyAllowBrowser, safe Markdown rendering of model output and rate limiting.'
---

# Security

Providers that need an API key refuse to run in the browser:

```ts
// Throws: "API keys must not be used in the browser…"
const ai = createOpenAI({ apiKey: 'sk-...' })
```

Opt in only for prototypes or trusted environments (e.g. Electron, internal tools):

```ts
const ai = createOpenAI({ apiKey: 'sk-...', dangerouslyAllowBrowser: true })
```

## Production setup

Keep keys on the server and talk to it with a proxy provider:

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

See [Server & Proxy](./server) and [Nuxt](./nuxt).

::: tip
The server handler accepts `model` and `system` from the request body. Use `onRequest` to pin them if clients must not choose.
:::
