---
description: '通过统一的 LLMProvider 接口，将 useChat 连接到 OpenAI、Anthropic Claude、Google Gemini、Ollama、浏览器内 WebGPU 模型或你自己的后端。'
---

# 模型提供方

所有提供方都实现了同一个 `LLMProvider` 接口，因此组合式函数、中间件和服务端处理器可以与其中任意一个配合使用。

## OpenAI

```ts
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1/chat/completions', // optional, full endpoint URL
})
```

任何兼容 OpenAI 的端点（Azure、Groq、OpenRouter、LM Studio……）都可以通过 `baseURL` 使用。

## Anthropic

```ts
import { createAnthropic } from 'vue-llm/providers'

const ai = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

useChat({ provider: ai, model: 'claude-sonnet-4-5', providerOptions: { maxTokens: 8192 } })
```

`maxTokens` 默认为 `4096`。扩展思考（extended thinking）的增量会以 `reasoning` part 的形式流式输出。

## Google Gemini

```ts
import { createGoogle } from 'vue-llm/providers'

const ai = createGoogle({ apiKey: process.env.GOOGLE_API_KEY! })

useChat({ provider: ai, model: 'gemini-2.5-flash' })
```

## Ollama

```ts
import { createOllama } from 'vue-llm/providers'

const ai = createOllama() // http://localhost:11434 by default
const remote = createOllama({ baseURL: 'http://gpu-box:11434' })
```

Ollama 不需要 API key，可以直接在浏览器中使用。

## 在浏览器中运行（WebGPU） {#in-the-browser-webgpu}

```ts
import { CreateMLCEngine } from '@mlc-ai/web-llm'
import { createWebLLM } from 'vue-llm/providers'

const ai = createWebLLM({ createEngine: CreateMLCEngine })

useChat({ provider: ai, model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC' })
```

模型运行在用户的 GPU 上，无需 API key 或服务器。参阅 [浏览器内模型](./in-browser)。

## 你自己的后端 {#your-own-backend}

`createSSEProvider` 可以连接任何以 Server-Sent Events 流式输出的服务器，并将其事件格式映射为 vue-llm 的 chunk。参阅 [自定义后端](./custom-backends)。

## 选项 {#options}

| 选项 | 提供方 | 说明 |
|--------|-----------|-------------|
| `apiKey` | OpenAI、Anthropic、Google | 必填 |
| `baseURL` | 全部 | 覆盖 API 端点 |
| `dangerouslyAllowBrowser` | OpenAI、Anthropic、Google | 允许在浏览器中使用 |

## 自定义提供方 {#custom-providers}

实现 `LLMProvider` 即可接入任何能流式输出的服务：

```ts
import type { LLMProvider } from 'vue-llm'

const echo: LLMProvider = {
  id: 'echo',
  supportsStreaming: true,
  validateConfig() {},
  async chat({ messages }) {
    const last = messages.at(-1)
    const text = typeof last?.content === 'string' ? last.content : ''
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'text-delta', text })
        controller.enqueue({ type: 'finish', finishReason: 'stop' })
        controller.close()
      },
    })
    return { stream, response: Promise.resolve({ finishReason: 'stop' }) }
  },
}
```

该流会产出 `ChatStreamChunk`：`text-delta`、`reasoning-delta`、`tool-call-start`、`tool-call-delta`、`tool-call-end`、`tool-result`、`finish` 和 `error`。

## 错误 {#errors}

HTTP 错误会以 `LLMAPIError` 抛出，包含 `status`、`provider`、`body`、`retryAfter` 和 `isRetryable`。参阅 [重试与限流](./retries-rate-limiting)。
