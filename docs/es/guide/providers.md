---
description: 'Conecta useChat a OpenAI, Anthropic Claude, Google Gemini, Ollama, modelos WebGPU en el navegador o tu propio backend mediante una única interfaz LLMProvider.'
---

# Proveedores

Todos los proveedores implementan la misma interfaz `LLMProvider`, así que los composables, el middleware y el manejador de servidor funcionan con cualquiera de ellos.

## OpenAI

```ts
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1/chat/completions', // optional, full endpoint URL
})
```

Cualquier endpoint compatible con OpenAI (Azure, Groq, OpenRouter, LM Studio…) funciona mediante `baseURL`.

## Anthropic

```ts
import { createAnthropic } from 'vue-llm/providers'

const ai = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

useChat({ provider: ai, model: 'claude-sonnet-4-5', providerOptions: { maxTokens: 8192 } })
```

`maxTokens` vale `4096` por defecto. Los deltas de extended thinking se transmiten como partes `reasoning`.

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

Ollama no necesita API key y se puede usar directamente desde el navegador.

## En el navegador (WebGPU) {#in-the-browser-webgpu}

```ts
import { CreateMLCEngine } from '@mlc-ai/web-llm'
import { createWebLLM } from 'vue-llm/providers'

const ai = createWebLLM({ createEngine: CreateMLCEngine })

useChat({ provider: ai, model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC' })
```

El modelo se ejecuta en la GPU del usuario, sin API key ni servidor. Consulta [Modelos en el navegador](./in-browser).

## Tu propio backend {#your-own-backend}

`createSSEProvider` se conecta a cualquier servidor que haga streaming de Server-Sent Events y traduce su formato de eventos a chunks de vue-llm. Consulta [Backends propios](./custom-backends).

## Opciones {#options}

| Opción | Proveedores | Descripción |
|--------|-----------|-------------|
| `apiKey` | OpenAI, Anthropic, Google | Obligatoria |
| `baseURL` | todos | Sobrescribe el endpoint de la API |
| `dangerouslyAllowBrowser` | OpenAI, Anthropic, Google | Permite usarlo en el navegador |

## Proveedores personalizados {#custom-providers}

Implementa `LLMProvider` para conectar cualquier cosa que haga streaming:

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

El stream emite `ChatStreamChunk`s: `text-delta`, `reasoning-delta`, `tool-call-start`, `tool-call-delta`, `tool-call-end`, `tool-result`, `finish` y `error`.

## Errores {#errors}

Los errores HTTP se lanzan como `LLMAPIError` con `status`, `provider`, `body`, `retryAfter` e `isRetryable`. Consulta [Reintentos y límites](./retries-rate-limiting).
