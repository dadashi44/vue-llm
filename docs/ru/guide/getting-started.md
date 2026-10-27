---
description: 'Установите vue-llm и соберите стриминговый AI-чат на Vue 3 или Nuxt в несколько строк с useChat. Поддерживаемые версии Vue, точки входа и формат сообщений.'
---

# Быстрый старт

## Установка {#installation}

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

`vue` — единственная peer-зависимость; runtime-зависимостей у пакета нет.

## Версии Vue {#vue-versions}

| | Vue 3.3+ | Vue 2.7 |
|---|---|---|
| Композаблы (`useChat`, `useCompletion`, `useObject`, `usePrompt`) | ✓ | ✓ |
| Провайдеры, middleware, хранилища, шаблоны промптов, сервер | ✓ | ✓ |
| `vue-llm/components` | ✓ | — |
| `vue-llm/nuxt` | Nuxt 3/4 | — |

Vue 2.7 поддерживается через встроенный Composition API — используйте композаблы в `setup()` (компоненты на Options API тоже могут вызывать их в `setup()`). Весь набор тестов прогоняется в CI на обеих версиях. Vue 2.6 и старше не поддерживаются; переход на 2.7 — минорное обновление.

## Точки входа {#entry-points}

| Импорт | Содержимое |
|--------|----------|
| `vue-llm` | Композаблы, middleware, хранилища, шаблоны промптов, типы |
| `vue-llm/providers` | `createOpenAI`, `createAnthropic`, `createGoogle`, `createOllama`, `createSSEProvider`, `createWebLLM`, `isWebGPUSupported` |
| `vue-llm/server` | `createLLMHandler`, `streamToSSE`, `createProxyProvider` |
| `vue-llm/nuxt` | Nuxt-модуль |
| `vue-llm/components` | Vue-компоненты |
| `vue-llm/devtools` | Плагин для Vue DevTools |
| `vue-llm/style.css` | Стили компонентов |

## Ваш первый чат {#your-first-chat}

```vue
<script setup lang="ts">
import { useChat } from 'vue-llm'
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // только для прототипов — см. «Безопасность»
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
Вызов провайдеров из браузера раскрывает ваш API-ключ. В продакшене запускайте провайдер на сервере, а на клиенте используйте [`createProxyProvider`](./server).
:::

## Формат сообщений {#message-format}

Сообщения состоят из частей (parts), поэтому текст, рассуждения, вызовы инструментов и файлы могут находиться в одном сообщении:

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
