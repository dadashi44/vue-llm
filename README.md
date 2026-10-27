# vue-llm

AI/LLM composables for Vue. The missing AI SDK for the Vue ecosystem.

`useChat()` with streaming, tool calling, multi-provider support — in 10 lines of code.

**Documentation:** https://dadashi44.github.io/vue-llm/

## Features

- **`useChat()`** — reactive composable with streaming, abort, regenerate
- **Multi-provider** — OpenAI, Anthropic, Ollama out of the box
- **Tool calling** — automatic roundtrips with `onToolCall` handler
- **Attachments** — images, PDFs, audio and text files, mapped per provider
- **Persistence** — restore chat history from localStorage or any custom backend
- **Resilience** — retries with exponential backoff, client and server rate limiting
- **Prompt templates** — `{{variables}}` with type inference, chat templates, reactive `usePrompt`
- **Any backend** — server-side tools in `createLLMHandler`, `createSSEProvider` for your own SSE API
- **Streaming** — SSE parser, text/reasoning/tool-call deltas
- **Security** — `dangerouslyAllowBrowser` guard protects API keys
- **Nuxt module** — auto-imports, server-side runtime config
- **Zero runtime deps** — only `vue` as peer dependency
- **TypeScript** — full type safety, exported types

## Quick Start

```bash
npm install vue-llm
```

```vue
<script setup>
import { useChat } from 'vue-llm'
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: 'sk-...',
  dangerouslyAllowBrowser: true, // only for prototyping
})

const { messages, input, handleSubmit, isLoading } = useChat({
  provider: ai,
  model: 'gpt-4o',
})
</script>

<template>
  <div v-for="msg in messages" :key="msg.id">
    <strong>{{ msg.role }}:</strong>
    <span v-for="(part, i) in msg.parts" :key="i">
      <template v-if="part.type === 'text'">{{ part.text }}</template>
    </span>
  </div>

  <form @submit.prevent="handleSubmit">
    <input v-model="input" placeholder="Ask something..." />
    <button :disabled="isLoading">Send</button>
  </form>
</template>
```

## Providers

### OpenAI

```ts
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})
```

### Anthropic

```ts
import { createAnthropic } from 'vue-llm/providers'

const ai = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'claude-sonnet-4-20250514',
})
```

### Ollama (local)

```ts
import { createOllama } from 'vue-llm/providers'

const ai = createOllama() // localhost:11434 by default

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'llama3',
})
```

## Tool Calling

```ts
const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: [
    {
      name: 'get_weather',
      description: 'Get weather for a city',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' },
        },
        required: ['city'],
      },
    },
  ],
  onToolCall: async ({ toolName, args }) => {
    if (toolName === 'get_weather') {
      return { temperature: 22, condition: 'sunny' }
    }
  },
  maxToolRoundtrips: 3,
})
```

## Attachments

Pass `File`, `FileList` or `FilePart` objects to `sendMessage`. Files are read as data URLs and stored as `file` parts on the user message.

```vue
<script setup lang="ts">
const { messages, input, sendMessage } = useChat({ provider: ai, model: 'gpt-4o' })
const files = ref<FileList>()

async function submit() {
  await sendMessage({ text: input.value, files: files.value })
  input.value = ''
  files.value = undefined
}
</script>

<template>
  <input type="file" multiple @change="files = ($event.target as HTMLInputElement).files ?? undefined">
  <input v-model="input" @keydown.enter="submit">
</template>
```

Remote URLs work too: `sendMessage({ files: { type: 'file', mediaType: 'image/png', url: 'https://…' } })`.

| Provider | Images | PDF | Audio | Text | Remote URLs |
|----------|--------|-----|-------|------|-------------|
| OpenAI | ✓ | ✓ | wav, mp3 | inlined as text | images only |
| Anthropic | ✓ | ✓ | — | ✓ (document) | images, PDF |
| Google | ✓ | ✓ | ✓ | ✓ | `fileData` URIs |
| Ollama | ✓ | — | — | inlined as text | — |

Unsupported combinations throw a descriptive error before the request is sent.

## Persistence

Pass a `storage` adapter and a stable `id` — history is restored on init and saved whenever a response finishes.

```ts
import { useChat, createWebStorage } from 'vue-llm'

const { messages, setMessages, isRestored } = useChat({
  id: 'support-chat',
  provider: ai,
  model: 'gpt-4o',
  storage: createWebStorage(), // localStorage, key `vue-llm:chat:support-chat`
})

setMessages([]) // clears history and removes the stored entry
```

`createWebStorage({ prefix, storage: sessionStorage })` customizes the key and backend; `createMemoryStorage()` is handy for tests. Any object implementing `ChatStorage` works, sync or async:

```ts
const storage: ChatStorage = {
  load: id => fetch(`/api/chats/${id}`).then(r => r.json()),
  save: (id, messages) => fetch(`/api/chats/${id}`, { method: 'PUT', body: JSON.stringify(messages) }).then(() => {}),
  remove: id => fetch(`/api/chats/${id}`, { method: 'DELETE' }).then(() => {}),
}
```

With async storage, `isRestored` is `false` until `load` resolves. Messages sent before that are kept — stored history won't overwrite them. Storage errors go to `onError`. Attachments are stored as data URLs, so large files can exceed the ~5 MB localStorage quota.

## Retries & Rate Limiting

```ts
import { wrapProvider, retryMiddleware, rateLimitMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  retryMiddleware({ maxRetries: 3, initialDelay: 1000, maxDelay: 30_000 }),
  rateLimitMiddleware({ maxRequests: 20, interval: 60_000, maxConcurrent: 2 }),
])
```

`retryMiddleware` re-sends the request on 408, 409, 429, 5xx and network errors with exponential backoff (`initialDelay * factor^n`, jittered), honoring `Retry-After` / `retry-after-ms`. Pass `shouldRetry(error, attempt)` to customize and `onRetry` to observe. Only the initial request is retried — errors after the stream has started are not.

`rateLimitMiddleware` queues requests client-side: at most `maxRequests` per `interval` and `maxConcurrent` open streams (a slot is freed when the stream ends or is cancelled). Aborting a queued request rejects it immediately.

Providers throw `LLMAPIError` with `status`, `provider`, `body`, `retryAfter` and `isRetryable`:

```ts
import { LLMAPIError } from 'vue-llm'

onError(error) {
  if (error instanceof LLMAPIError && error.status === 429) showToast('Slow down')
}
```

On the server, `createLLMHandler` can limit requests per client (keyed by `x-forwarded-for` / `x-real-ip` by default) and responds with `429` + `Retry-After`:

```ts
createLLMHandler({
  provider,
  rateLimit: { maxRequests: 10, interval: 60_000, key: req => req.headers.get('x-user-id') ?? 'anon' },
})
```

The server limiter is in-memory per instance — for multi-instance deployments put a shared limiter (e.g. Redis-backed) in front of the handler.

## System Prompt

```ts
const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  system: 'You are a helpful assistant that speaks like a pirate.',
})
```

`system` also accepts a ref or getter (in `useChat`, `useCompletion` and `useObject`) and is re-read on every request.

## Prompt Templates

Variable names are inferred from the template string, so missing or misspelled variables are type errors:

```ts
import { createPrompt, createChatPrompt, usePrompt } from 'vue-llm'

const translate = createPrompt('Translate {{ text }} to {{lang}}.', { defaults: { lang: 'English' } })

translate.render({ text: 'Hola' })          // 'Translate Hola to English.'
translate.render({ txt: 'Hola' })           // ✗ type error
translate.variables                         // ['text', 'lang']
```

Missing values throw at runtime too. Escape a placeholder with a backslash: `\{{literal}}`.

Reactive prompts with `usePrompt`:

```ts
const lang = ref('French')
const system = usePrompt('Always reply in {{lang}}.', () => ({ lang: lang.value }))

const chat = useChat({ provider: ai, model: 'gpt-4o', system })
```

Multi-message templates:

```ts
const tutor = createChatPrompt([
  { role: 'system', content: 'You are a {{level}} tutor.' },
  { role: 'user', content: 'Explain {{topic}}.' },
])

tutor.render({ level: 'patient', topic: 'recursion' })      // ChatMessage[] for provider.chat()
useChat({ provider: ai, model: 'gpt-4o', initialMessages: tutor.toUIMessages({ level: 'patient', topic: 'recursion' }) })
```

## API Reference

### `useChat(options)`

Returns a reactive chat interface.

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `provider` | `LLMProvider` | Provider instance (required) |
| `model` | `string` | Model ID (required) |
| `system` | `string` | System prompt |
| `tools` | `ToolDefinition[]` | Available tools |
| `onToolCall` | `(call) => unknown` | Tool call handler |
| `onFinish` | `(msg, ctx) => void` | Called when response completes |
| `onError` | `(error) => void` | Error handler |
| `maxToolRoundtrips` | `number` | Max tool call rounds (default: 5) |
| `storage` | `ChatStorage` | Persist and restore messages by `id` |

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `messages` | `Ref<UIMessage[]>` | Chat messages |
| `status` | `Ref<ChatStatus>` | `'ready' \| 'submitted' \| 'streaming' \| 'error'` |
| `error` | `Ref<Error \| undefined>` | Last error |
| `input` | `Ref<string>` | Input text (v-model) |
| `isLoading` | `ComputedRef<boolean>` | Whether a request is active |
| `sendMessage` | `(text? \| { text?, files? }) => Promise` | Send a message, optionally with attachments |
| `stop` | `() => void` | Abort current stream |
| `regenerate` | `() => Promise` | Re-send last user message |
| `setMessages` | `(msgs) => void` | Replace message history |
| `handleSubmit` | `() => Promise` | Form submit handler (sends `input.value`) |
| `clearError` | `() => void` | Clear error state |
| `isRestored` | `Ref<boolean>` | `false` while async storage is loading |

## Nuxt Module

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['vue-llm/nuxt'],
  runtimeConfig: {
    vueLlm: {
      openaiApiKey: '',
      anthropicApiKey: '',
    },
  },
})
```

Composables and provider factories are auto-imported.

## Security

Providers throw an error if used in the browser without explicit opt-in:

```ts
// This will throw in browser:
const ai = createOpenAI({ apiKey: 'sk-...' })

// Opt-in for prototyping only:
const ai = createOpenAI({
  apiKey: 'sk-...',
  dangerouslyAllowBrowser: true,
})
```

For production, proxy API calls through your server or use the Nuxt module with `runtimeConfig`.

## Message Format

Messages use a parts-based format for rich content:

```ts
interface UIMessage {
  id: string
  role: 'user' | 'assistant'
  parts: UIMessagePart[]
}

type UIMessagePart =
  | { type: 'text'; text: string; state: 'streaming' | 'done' }
  | { type: 'reasoning'; text: string; state: 'streaming' | 'done' }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown; state: string }
```

## License

MIT
