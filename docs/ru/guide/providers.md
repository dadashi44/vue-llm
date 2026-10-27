---
description: 'Подключите useChat к OpenAI, Anthropic Claude, Google Gemini, Ollama, моделям в браузере на WebGPU или своему бэкенду через единый интерфейс LLMProvider.'
---

# Провайдеры

Все провайдеры реализуют один и тот же интерфейс `LLMProvider`, поэтому композаблы, middleware и серверный обработчик работают с любым из них.

## OpenAI {#openai}

```ts
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1/chat/completions', // необязательно, полный URL эндпоинта
})
```

Любой OpenAI-совместимый эндпоинт (Azure, Groq, OpenRouter, LM Studio…) подключается через `baseURL`.

## Anthropic {#anthropic}

```ts
import { createAnthropic } from 'vue-llm/providers'

const ai = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

useChat({ provider: ai, model: 'claude-sonnet-4-5', providerOptions: { maxTokens: 8192 } })
```

По умолчанию `maxTokens` равен `4096`. Дельты extended thinking стримятся как части `reasoning`.

## Google Gemini {#google-gemini}

```ts
import { createGoogle } from 'vue-llm/providers'

const ai = createGoogle({ apiKey: process.env.GOOGLE_API_KEY! })

useChat({ provider: ai, model: 'gemini-2.5-flash' })
```

## Ollama {#ollama}

```ts
import { createOllama } from 'vue-llm/providers'

const ai = createOllama() // по умолчанию http://localhost:11434
const remote = createOllama({ baseURL: 'http://gpu-box:11434' })
```

Ollama не нужен API-ключ, и её можно вызывать прямо из браузера.

## В браузере (WebGPU) {#in-the-browser-webgpu}

```ts
import { CreateMLCEngine } from '@mlc-ai/web-llm'
import { createWebLLM } from 'vue-llm/providers'

const ai = createWebLLM({ createEngine: CreateMLCEngine })

useChat({ provider: ai, model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC' })
```

Модель работает на GPU пользователя, без API-ключа и сервера. См. [Модели в браузере](./in-browser).

## Свой бэкенд {#your-own-backend}

`createSSEProvider` подключается к любому серверу, который стримит Server-Sent Events, и преобразует формат его событий в чанки vue-llm. См. [Свой бэкенд](./custom-backends).

## Опции {#options}

| Опция | Провайдеры | Описание |
|--------|-----------|-------------|
| `apiKey` | OpenAI, Anthropic, Google | Обязательна |
| `baseURL` | все | Переопределяет эндпоинт API |
| `dangerouslyAllowBrowser` | OpenAI, Anthropic, Google | Разрешает использование в браузере |

## Собственные провайдеры {#custom-providers}

Реализуйте `LLMProvider`, чтобы подключить что угодно, что умеет стримить:

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

Поток отдаёт `ChatStreamChunk`: `text-delta`, `reasoning-delta`, `tool-call-start`, `tool-call-delta`, `tool-call-end`, `tool-result`, `finish` и `error`.

## Ошибки {#errors}

HTTP-ошибки выбрасываются как `LLMAPIError` с полями `status`, `provider`, `body`, `retryAfter` и `isRetryable`. См. [Повторы и лимиты](./retries-rate-limiting).
