# vue-llm

AI/LLM composables for Vue. The missing AI SDK for the Vue ecosystem.

`useChat()` with streaming, tool calling, multi-provider support — in 10 lines of code.

## Features

- **`useChat()`** — reactive composable with streaming, abort, regenerate
- **Multi-provider** — OpenAI, Anthropic, Ollama out of the box
- **Tool calling** — automatic roundtrips with `onToolCall` handler
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
  model: 'gpt-4o', // default model
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

## System Prompt

```ts
const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  system: 'You are a helpful assistant that speaks like a pirate.',
})
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

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `messages` | `Ref<UIMessage[]>` | Chat messages |
| `status` | `Ref<ChatStatus>` | `'ready' \| 'submitted' \| 'streaming' \| 'error'` |
| `error` | `Ref<Error \| undefined>` | Last error |
| `input` | `Ref<string>` | Input text (v-model) |
| `isLoading` | `ComputedRef<boolean>` | Whether a request is active |
| `sendMessage` | `(text?) => Promise` | Send a message |
| `stop` | `() => void` | Abort current stream |
| `regenerate` | `() => Promise` | Re-send last user message |
| `setMessages` | `(msgs) => void` | Replace message history |
| `handleSubmit` | `() => Promise` | Form submit handler (sends `input.value`) |
| `clearError` | `() => void` | Clear error state |

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
