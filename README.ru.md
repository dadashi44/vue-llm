# vue-llm

[English](./README.md) · **Русский** · [简体中文](./README.zh-CN.md) · [Português](./README.pt-BR.md) · [Español](./README.es.md) · [日本語](./README.ja.md)

[![npm version](https://img.shields.io/npm/v/vue-llm.svg)](https://www.npmjs.com/package/vue-llm)
[![npm downloads](https://img.shields.io/npm/dm/vue-llm.svg)](https://www.npmjs.com/package/vue-llm)
[![CI](https://github.com/dadashi44/vue-llm/actions/workflows/ci.yml/badge.svg)](https://github.com/dadashi44/vue-llm/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/vue-llm.svg)](./LICENSE)

**vue-llm** — AI SDK для Vue и Nuxt: стриминговый `useChat`, вызов инструментов, Generative UI и модели в браузере для OpenAI, Anthropic, Gemini, Ollama и WebGPU.

`useChat()` со стримингом, вызовом инструментов и поддержкой нескольких провайдеров — в 10 строк кода.

**Документация:** https://vue-llm.js.org/ru/ · **[Попробуйте в браузере](https://vue-llm.js.org/ru/playground)** — API-ключ не нужен

## Возможности

- **`useChat()`** — реактивный композабл со стримингом, отменой и повторной генерацией
- **Несколько провайдеров** — OpenAI, Anthropic, Gemini и Ollama из коробки
- **Модели в браузере** — запускайте Llama, Qwen или SmolLM на WebGPU через `createWebLLM`, без сервера и API-ключа
- **Generative UI** — рендерите вызовы инструментов своими Vue-компонентами через `<MessageParts>`, со стримингом аргументов и human-in-the-loop
- **Вызов инструментов** — `defineTool` с `execute`, `onToolCall`, `addToolResult`
- **Вложения** — изображения, PDF, аудио и текстовые файлы в формате каждого провайдера
- **Сохранение истории** — восстановление истории чата из localStorage или любого своего хранилища
- **Устойчивость** — повторы с экспоненциальной задержкой, ограничение частоты запросов на клиенте и на сервере
- **Шаблоны промптов** — `{{variables}}` с выводом типов, шаблоны чата, реактивный `usePrompt`
- **Любой бэкенд** — серверные инструменты в `createLLMHandler`, `createSSEProvider` для вашего собственного SSE API
- **Стриминг** — SSE-парсер, дельты текста, рассуждений и вызовов инструментов
- **Безопасность** — защита `dangerouslyAllowBrowser` бережёт API-ключи
- **Chat UI** — готовый чат, код которого принадлежит вам: `npx shadcn-vue add https://vue-llm.js.org/r/chat.json`, плюс headless `usePromptInput` и `useAutoScroll`
- **Vue DevTools** — вкладка LLM со всеми чатами, таймлайном запросов, временем до первого токена, вызовами инструментов и расходом токенов (`vue-llm/devtools`)
- **Nuxt-модуль** — автоимпорты, компоненты, DevTools в режиме разработки, серверный runtime config
- **Ноль runtime-зависимостей** — только `vue` в peer-зависимостях (Vue 3.3+, композаблы работают и на Vue 2.7)
- **TypeScript** — полная типобезопасность, экспортируемые типы

## Быстрый старт

```bash
npm install vue-llm
```

```vue
<script setup>
import { useChat } from 'vue-llm'
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: 'sk-...',
  dangerouslyAllowBrowser: true, // только для прототипов
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

## Провайдеры

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
  model: 'claude-sonnet-4-5',
})
```

### Ollama (локально)

```ts
import { createOllama } from 'vue-llm/providers'

const ai = createOllama() // по умолчанию localhost:11434

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'llama3',
})
```

### В браузере (WebGPU)

```ts
import { CreateMLCEngine } from '@mlc-ai/web-llm' // npm i @mlc-ai/web-llm
import { createWebLLM } from 'vue-llm/providers'

const ai = createWebLLM({
  createEngine: CreateMLCEngine,
  onProgress: ({ progress }) => console.log(`${Math.round(progress * 100)}%`),
})

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
})
```

Модель работает на GPU пользователя, и ничего не покидает устройство. См. [Модели в браузере](https://vue-llm.js.org/ru/guide/in-browser).

## Вызов инструментов

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

## Вложения

Передавайте в `sendMessage` объекты `File`, `FileList` или `FilePart`. Файлы читаются как data URL и сохраняются как части `file` в сообщении пользователя.

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

Удалённые URL тоже работают: `sendMessage({ files: { type: 'file', mediaType: 'image/png', url: 'https://…' } })`.

| Провайдер | Изображения | PDF | Аудио | Текст | Удалённые URL |
|----------|--------|-----|-------|------|-------------|
| OpenAI | ✓ | ✓ | wav, mp3 | встраивается как текст | только изображения |
| Anthropic | ✓ | ✓ | — | ✓ (document) | изображения, PDF |
| Google | ✓ | ✓ | ✓ | ✓ | URI `fileData` |
| Ollama | ✓ | — | — | встраивается как текст | — |

Для неподдерживаемых комбинаций ещё до отправки запроса выбрасывается ошибка с понятным описанием.

## Сохранение истории

Передайте адаптер `storage` и стабильный `id` — история восстанавливается при инициализации и сохраняется каждый раз, когда ответ завершён.

```ts
import { useChat, createWebStorage } from 'vue-llm'

const { messages, setMessages, isRestored } = useChat({
  id: 'support-chat',
  provider: ai,
  model: 'gpt-4o',
  storage: createWebStorage(), // localStorage, ключ `vue-llm:chat:support-chat`
})

setMessages([]) // очищает историю и удаляет сохранённую запись
```

`createWebStorage({ prefix, storage: sessionStorage })` настраивает ключ и хранилище; `createMemoryStorage()` удобен для тестов. Подойдёт любой объект, реализующий `ChatStorage`, синхронный или асинхронный:

```ts
const storage: ChatStorage = {
  load: id => fetch(`/api/chats/${id}`).then(r => r.json()),
  save: (id, messages) => fetch(`/api/chats/${id}`, { method: 'PUT', body: JSON.stringify(messages) }).then(() => {}),
  remove: id => fetch(`/api/chats/${id}`, { method: 'DELETE' }).then(() => {}),
}
```

С асинхронным хранилищем `isRestored` равен `false`, пока не завершится `load`. Сообщения, отправленные до этого, сохраняются — сохранённая история их не перезапишет. Ошибки хранилища попадают в `onError`. Вложения сохраняются как data URL, поэтому большие файлы могут превысить квоту localStorage (~5 МБ).

## Повторы и лимиты

```ts
import { wrapProvider, retryMiddleware, rateLimitMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  retryMiddleware({ maxRetries: 3, initialDelay: 1000, maxDelay: 30_000 }),
  rateLimitMiddleware({ maxRequests: 20, interval: 60_000, maxConcurrent: 2 }),
])
```

`retryMiddleware` повторно отправляет запрос при ответах 408, 409, 429, 5xx и сетевых ошибках с экспоненциальной задержкой (`initialDelay * factor^n`, с джиттером) и учитывает `Retry-After` / `retry-after-ms`. Передайте `shouldRetry(error, attempt)`, чтобы изменить политику, и `onRetry`, чтобы отслеживать повторы. Повторяется только исходный запрос — ошибки после начала стриминга не повторяются.

`rateLimitMiddleware` ставит запросы в очередь на клиенте: не больше `maxRequests` за `interval` и не больше `maxConcurrent` открытых потоков (слот освобождается, когда поток завершается или отменяется). Отмена запроса, стоящего в очереди, сразу его отклоняет.

Провайдеры выбрасывают `LLMAPIError` с полями `status`, `provider`, `body`, `retryAfter` и `isRetryable`:

```ts
import { LLMAPIError } from 'vue-llm'

onError(error) {
  if (error instanceof LLMAPIError && error.status === 429) showToast('Slow down')
}
```

На сервере `createLLMHandler` может ограничивать запросы для каждого клиента (по умолчанию ключ — `x-forwarded-for` / `x-real-ip`) и отвечает `429` + `Retry-After`:

```ts
createLLMHandler({
  provider,
  rateLimit: { maxRequests: 10, interval: 60_000, key: req => req.headers.get('x-user-id') ?? 'anon' },
})
```

Серверный лимитер хранит данные в памяти каждого инстанса — если инстансов несколько, поставьте перед обработчиком общий лимитер (например, на Redis).

## Системный промпт

```ts
const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  system: 'You are a helpful assistant that speaks like a pirate.',
})
```

`system` также принимает ref или геттер (в `useChat`, `useCompletion` и `useObject`) и перечитывается при каждом запросе.

## Шаблоны промптов

Имена переменных выводятся из строки шаблона, поэтому пропущенная переменная или опечатка в её имени — это ошибка типов:

```ts
import { createPrompt, createChatPrompt, usePrompt } from 'vue-llm'

const translate = createPrompt('Translate {{ text }} to {{lang}}.', { defaults: { lang: 'English' } })

translate.render({ text: 'Hola' })          // 'Translate Hola to English.'
translate.render({ txt: 'Hola' })           // ✗ type error
translate.variables                         // ['text', 'lang']
```

Пропущенные значения вызывают ошибку и в рантайме. Плейсхолдер экранируется обратным слешем: `\{{literal}}`.

Реактивные промпты через `usePrompt`:

```ts
const lang = ref('French')
const system = usePrompt('Always reply in {{lang}}.', () => ({ lang: lang.value }))

const chat = useChat({ provider: ai, model: 'gpt-4o', system })
```

Шаблоны из нескольких сообщений:

```ts
const tutor = createChatPrompt([
  { role: 'system', content: 'You are a {{level}} tutor.' },
  { role: 'user', content: 'Explain {{topic}}.' },
])

tutor.render({ level: 'patient', topic: 'recursion' })      // ChatMessage[] для provider.chat()
useChat({ provider: ai, model: 'gpt-4o', initialMessages: tutor.toUIMessages({ level: 'patient', topic: 'recursion' }) })
```

## Справочник API

### `useChat(options)`

Возвращает реактивный интерфейс чата.

**Опции:**

| Опция | Тип | Описание |
|--------|------|-------------|
| `provider` | `LLMProvider` | Экземпляр провайдера (обязательна) |
| `model` | `string` | ID модели (обязательна) |
| `system` | `MaybeRefOrGetter<string>` | Системный промпт |
| `tools` | `ToolDefinition[]` | Доступные инструменты |
| `onToolCall` | `(call) => unknown` | Обработчик вызовов инструментов |
| `onFinish` | `(msg, ctx) => void` | Вызывается, когда ответ завершён |
| `onError` | `(error) => void` | Обработчик ошибок |
| `maxToolRoundtrips` | `number` | Максимум раундов вызова инструментов (по умолчанию: 5) |
| `storage` | `ChatStorage` | Сохранение и восстановление сообщений по `id` |

**Возвращает:**

| Свойство | Тип | Описание |
|----------|------|-------------|
| `messages` | `Ref<UIMessage[]>` | Сообщения чата |
| `status` | `Ref<ChatStatus>` | `'ready' \| 'submitted' \| 'streaming' \| 'error'` |
| `error` | `Ref<Error \| undefined>` | Последняя ошибка |
| `input` | `Ref<string>` | Текст поля ввода (v-model) |
| `isLoading` | `Ref<boolean>` | Выполняется ли запрос |
| `sendMessage` | `(text? \| { text?, files? }) => Promise` | Отправляет сообщение, при необходимости с вложениями |
| `stop` | `() => void` | Прерывает текущий поток |
| `regenerate` | `() => Promise` | Удаляет последний ответ ассистента и генерирует его заново |
| `setMessages` | `(msgs) => void` | Заменяет историю сообщений |
| `handleSubmit` | `(event?: Event) => void` | Обработчик отправки формы (отправляет `input.value`) |
| `clearError` | `() => void` | Сбрасывает состояние ошибки |
| `isRestored` | `Ref<boolean>` | `false`, пока загружается асинхронное хранилище |

## Nuxt-модуль

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

Композаблы и фабрики провайдеров импортируются автоматически.

## Безопасность

Провайдеры выбрасывают ошибку, если их используют в браузере без явного разрешения:

```ts
// В браузере выбросит ошибку:
const ai = createOpenAI({ apiKey: 'sk-...' })

// Явное разрешение — только для прототипов:
const ai = createOpenAI({
  apiKey: 'sk-...',
  dangerouslyAllowBrowser: true,
})
```

В продакшене проксируйте вызовы API через свой сервер или используйте Nuxt-модуль с `runtimeConfig`.

## Формат сообщений

Для богатого содержимого сообщения используют формат на основе частей (parts):

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

## Лицензия

MIT
