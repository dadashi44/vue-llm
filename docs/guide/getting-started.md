# Getting Started

## Installation

::: code-group

```bash [npm]
npm install vue-llm
```

```bash [pnpm]
pnpm add vue-llm
```

```bash [yarn]
yarn add vue-llm
```

:::

`vue` is the only peer dependency; the package has zero runtime dependencies.

## Vue versions

| | Vue 3.3+ | Vue 2.7 |
|---|---|---|
| Composables (`useChat`, `useCompletion`, `useObject`, `usePrompt`) | ✓ | ✓ |
| Providers, middleware, storage, prompt templates, server | ✓ | ✓ |
| `vue-llm/components` | ✓ | — |
| `vue-llm/nuxt` | Nuxt 3/4 | — |

Vue 2.7 is supported through its built-in Composition API — use the composables in `setup()` (Options API components can call them in `setup()` too). The whole test suite runs on both versions in CI. Vue 2.6 and older are not supported; upgrading to 2.7 is a minor update.

## Entry points

| Import | Contents |
|--------|----------|
| `vue-llm` | Composables, middleware, storage, prompt templates, types |
| `vue-llm/providers` | `createOpenAI`, `createAnthropic`, `createGoogle`, `createOllama` |
| `vue-llm/server` | `createLLMHandler`, `streamToSSE`, `createProxyProvider` |
| `vue-llm/nuxt` | Nuxt module |
| `vue-llm/components` | Vue components |

## Your first chat

```vue
<script setup lang="ts">
import { useChat } from 'vue-llm'
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // prototyping only — see Security
})

const { messages, input, handleSubmit, isLoading, stop } = useChat({
  provider: ai,
  model: 'gpt-4o',
})
</script>

<template>
  <div v-for="msg in messages" :key="msg.id">
    <strong>{{ msg.role }}:</strong>
    <template v-for="(part, i) in msg.parts" :key="i">
      <span v-if="part.type === 'text'">{{ part.text }}</span>
    </template>
  </div>

  <form @submit.prevent="handleSubmit">
    <input v-model="input" placeholder="Ask something…">
    <button v-if="isLoading" type="button" @click="stop">Stop</button>
    <button v-else>Send</button>
  </form>
</template>
```

::: warning
Calling providers from the browser exposes your API key. For production, run the provider on a server and use [`createProxyProvider`](./server) on the client.
:::

## Message format

Messages are made of parts, so text, reasoning, tool calls and files can live in one message:

```ts
interface UIMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: UIMessagePart[]
  metadata?: Record<string, unknown>
  createdAt?: Date
}

type UIMessagePart =
  | { type: 'text'; text: string; state?: 'streaming' | 'done' }
  | { type: 'reasoning'; text: string; state?: 'streaming' | 'done' }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown; state: 'streaming' | 'pending' | 'running' | 'result' | 'error'; result?: unknown; error?: string }
  | { type: 'file'; mediaType: string; url: string; filename?: string }
  | { type: 'source'; url: string; title?: string }
```
