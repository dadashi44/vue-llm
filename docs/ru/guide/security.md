---
description: 'Не допускайте API-ключи LLM в браузер: серверный прокси, dangerouslyAllowBrowser, безопасный рендеринг Markdown из ответов модели и ограничение частоты запросов.'
---

# Безопасность

Провайдеры, которым нужен API-ключ, отказываются работать в браузере:

```ts
// Throws: "API keys must not be used in the browser…"
const ai = createOpenAI({ apiKey: 'sk-...' })
```

Включайте эту возможность явно и только для прототипов или доверенных окружений (например, Electron или внутренних инструментов):

```ts
const ai = createOpenAI({ apiKey: 'sk-...', dangerouslyAllowBrowser: true })
```

## Настройка для продакшена {#production-setup}

Храните ключи на сервере и общайтесь с ним через прокси-провайдер:

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

См. [Сервер и прокси](./server) и [Nuxt](./nuxt).

::: tip
Серверный обработчик принимает `model` и `system` из тела запроса. Если клиенты не должны их выбирать, зафиксируйте значения в `onRequest`.
:::
