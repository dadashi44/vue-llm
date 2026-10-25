# Providers

Every provider implements the same `LLMProvider` interface, so composables, middleware and the server handler work with any of them.

## OpenAI

```ts
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com/v1/chat/completions', // optional, full endpoint URL
})
```

Any OpenAI-compatible endpoint (Azure, Groq, OpenRouter, LM Studio…) works via `baseURL`.

## Anthropic

```ts
import { createAnthropic } from 'vue-llm/providers'

const ai = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

useChat({ provider: ai, model: 'claude-sonnet-4-5', providerOptions: { maxTokens: 8192 } })
```

`maxTokens` defaults to `4096`. Extended-thinking deltas are streamed as `reasoning` parts.

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

Ollama needs no API key and can be used directly from the browser.

## Options

| Option | Providers | Description |
|--------|-----------|-------------|
| `apiKey` | OpenAI, Anthropic, Google | Required |
| `baseURL` | all | Override the API endpoint |
| `dangerouslyAllowBrowser` | OpenAI, Anthropic, Google | Allow usage in the browser |

## Custom providers

Implement `LLMProvider` to plug in anything that streams:

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

The stream emits `ChatStreamChunk`s: `text-delta`, `reasoning-delta`, `tool-call-start`, `tool-call-delta`, `tool-call-end`, `finish` and `error`.

## Errors

HTTP errors are thrown as `LLMAPIError` with `status`, `provider`, `body`, `retryAfter` and `isRetryable`. See [Retries & Rate Limiting](./retries-rate-limiting).
