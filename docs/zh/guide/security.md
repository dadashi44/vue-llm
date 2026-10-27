---
description: '不让 LLM API key 暴露在浏览器中：服务端代理、dangerouslyAllowBrowser、模型输出的安全 Markdown 渲染以及限流。'
---

# 安全

需要 API key 的提供方会拒绝在浏览器中运行：

```ts
// Throws: "API keys must not be used in the browser…"
const ai = createOpenAI({ apiKey: 'sk-...' })
```

仅在原型开发或受信任的环境（例如 Electron、内部工具）中才应显式开启：

```ts
const ai = createOpenAI({ apiKey: 'sk-...', dangerouslyAllowBrowser: true })
```

## 生产环境配置 {#production-setup}

将密钥保存在服务端，并通过代理提供方与之通信：

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

参阅 [服务端与代理](./server) 和 [Nuxt](./nuxt)。

::: tip
服务端处理器会从请求体中读取 `model` 和 `system`。如果不允许客户端自行选择，请使用 `onRequest` 固定它们。
:::
