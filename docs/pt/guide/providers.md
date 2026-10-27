---
description: 'Conecte o useChat à OpenAI, Anthropic Claude, Google Gemini, Ollama, modelos WebGPU no navegador ou ao seu próprio backend por meio de uma única interface LLMProvider.'
---

# Provedores

Todos os provedores implementam a mesma interface `LLMProvider`, então composables, middleware e o handler de servidor funcionam com qualquer um deles.

## OpenAI

```ts
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1/chat/completions', // optional, full endpoint URL
})
```

Qualquer endpoint compatível com a OpenAI (Azure, Groq, OpenRouter, LM Studio…) funciona via `baseURL`.

## Anthropic

```ts
import { createAnthropic } from 'vue-llm/providers'

const ai = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

useChat({ provider: ai, model: 'claude-sonnet-4-5', providerOptions: { maxTokens: 8192 } })
```

`maxTokens` tem `4096` como padrão. Os deltas de extended thinking chegam via streaming como partes `reasoning`.

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

O Ollama não precisa de API key e pode ser usado direto do navegador.

## No navegador (WebGPU) {#in-the-browser-webgpu}

```ts
import { CreateMLCEngine } from '@mlc-ai/web-llm'
import { createWebLLM } from 'vue-llm/providers'

const ai = createWebLLM({ createEngine: CreateMLCEngine })

useChat({ provider: ai, model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC' })
```

O modelo roda na GPU do usuário, sem API key nem servidor. Veja [Modelos no navegador](./in-browser).

## Seu próprio backend {#your-own-backend}

`createSSEProvider` se conecta a qualquer servidor que faça streaming de Server-Sent Events, mapeando o formato dos eventos dele para chunks do vue-llm. Veja [Backends próprios](./custom-backends).

## Opções {#options}

| Opção | Provedores | Descrição |
|--------|-----------|-------------|
| `apiKey` | OpenAI, Anthropic, Google | Obrigatória |
| `baseURL` | todos | Sobrescreve o endpoint da API |
| `dangerouslyAllowBrowser` | OpenAI, Anthropic, Google | Permite o uso no navegador |

## Provedores customizados {#custom-providers}

Implemente `LLMProvider` para plugar qualquer coisa que faça streaming:

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

O stream emite `ChatStreamChunk`s: `text-delta`, `reasoning-delta`, `tool-call-start`, `tool-call-delta`, `tool-call-end`, `tool-result`, `finish` e `error`.

## Erros {#errors}

Erros HTTP são lançados como `LLMAPIError`, com `status`, `provider`, `body`, `retryAfter` e `isRetryable`. Veja [Retentativas e limites](./retries-rate-limiting).
