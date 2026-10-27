---
description: 'Mantenha as API keys de LLM fora do navegador: proxy no servidor, dangerouslyAllowBrowser, renderização segura de Markdown da saída do modelo e rate limiting.'
---

# Segurança

Provedores que exigem API key se recusam a rodar no navegador:

```ts
// Throws: "API keys must not be used in the browser…"
const ai = createOpenAI({ apiKey: 'sk-...' })
```

Libere isso só em protótipos ou ambientes confiáveis (por exemplo, Electron ou ferramentas internas):

```ts
const ai = createOpenAI({ apiKey: 'sk-...', dangerouslyAllowBrowser: true })
```

## Configuração para produção {#production-setup}

Mantenha as chaves no servidor e converse com ele por meio de um provedor proxy:

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

Veja [Servidor e proxy](./server) e [Nuxt](./nuxt).

::: tip
O handler de servidor aceita `model` e `system` vindos do corpo da requisição. Use `onRequest` para fixá-los se os clientes não puderem escolher.
:::
