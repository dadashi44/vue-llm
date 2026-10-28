# vue-llm

[English](./README.md) · [Русский](./README.ru.md) · **简体中文** · [Português](./README.pt-BR.md) · [Español](./README.es.md) · [日本語](./README.ja.md)

[![npm version](https://img.shields.io/npm/v/vue-llm.svg)](https://www.npmjs.com/package/vue-llm)
[![npm downloads](https://img.shields.io/npm/dm/vue-llm.svg)](https://www.npmjs.com/package/vue-llm)
[![CI](https://github.com/dadashi44/vue-llm/actions/workflows/ci.yml/badge.svg)](https://github.com/dadashi44/vue-llm/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/vue-llm.svg)](./LICENSE)

**vue-llm** 是面向 Vue 和 Nuxt 的 AI SDK：提供流式 `useChat`、工具调用、生成式 UI 以及浏览器内模型，支持 OpenAI、Anthropic、Gemini、Ollama 和 WebGPU。

带流式输出、工具调用和多提供方支持的 `useChat()`，只需 10 行代码。

**文档：** https://vue-llm.js.org/zh/ · **[在浏览器中体验](https://vue-llm.js.org/zh/playground)**，无需 API key

## 特性

- **`useChat()`**：支持流式输出、中止和重新生成的响应式组合式函数
- **多提供方**：开箱即用地支持 OpenAI、Anthropic、Gemini、Ollama
- **浏览器内模型**：使用 `createWebLLM` 在 WebGPU 上运行 Llama、Qwen 或 SmolLM，无需服务器或 API key
- **生成式 UI**：通过 `<MessageParts>` 将工具调用渲染为你的 Vue 组件，支持流式参数和人工介入
- **工具调用**：带 `execute` 的 `defineTool`、`onToolCall`、`addToolResult`
- **附件**：图片、PDF、音频和文本文件，按提供方自动转换格式
- **持久化**：从 localStorage 或任意自定义后端恢复聊天记录
- **稳定可靠**：指数退避重试，客户端与服务端限流
- **提示词模板**：带类型推断的 `{{variables}}`、聊天模板、响应式的 `usePrompt`
- **任意后端**：`createLLMHandler` 中的服务端工具，以及用于接入你自己 SSE API 的 `createSSEProvider`
- **流式处理**：SSE 解析器，文本/推理/工具调用增量
- **安全**：`dangerouslyAllowBrowser` 保护机制，防止 API key 泄露
- **聊天界面**：一套完全属于你的聊天界面：`npx shadcn-vue add https://vue-llm.js.org/r/chat.json`，另有无头的 `usePromptInput` 和 `useAutoScroll`
- **Vue DevTools**：LLM 标签页，展示所有聊天、请求时间线、首 token 时间、工具调用和 token 用量（`vue-llm/devtools`）
- **Nuxt 模块**：自动导入、组件、开发环境下的 DevTools、服务端运行时配置
- **零运行时依赖**：唯一的 peer 依赖是 `vue`（Vue 3.3+，组合式函数也支持 Vue 2.7）
- **TypeScript**：完整的类型安全，导出全部类型

## 快速开始

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

## 模型提供方

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

### Ollama（本地）

```ts
import { createOllama } from 'vue-llm/providers'

const ai = createOllama() // localhost:11434 by default

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'llama3',
})
```

### 在浏览器中运行（WebGPU）

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

模型运行在用户的 GPU 上，数据不会离开设备。参阅 [浏览器内模型](https://vue-llm.js.org/zh/guide/in-browser)。

## 工具调用

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

## 附件

向 `sendMessage` 传入 `File`、`FileList` 或 `FilePart` 对象。文件会被读取为 data URL，并作为 `file` part 存储在用户消息中。

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

也支持远程 URL：`sendMessage({ files: { type: 'file', mediaType: 'image/png', url: 'https://…' } })`。

| 提供方 | 图片 | PDF | 音频 | 文本 | 远程 URL |
|----------|--------|-----|-------|------|-------------|
| OpenAI | ✓ | ✓ | wav、mp3 | 内联为文本 | 仅图片 |
| Anthropic | ✓ | ✓ | — | ✓（document） | 图片、PDF |
| Google | ✓ | ✓ | ✓ | ✓ | `fileData` URI |
| Ollama | ✓ | — | — | 内联为文本 | — |

不支持的组合会在发送请求之前抛出描述清晰的错误。

## 持久化

传入一个 `storage` 适配器和一个稳定的 `id`：初始化时恢复历史记录，每当一次响应完成时保存。

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

`createWebStorage({ prefix, storage: sessionStorage })` 可以自定义键和存储后端；`createMemoryStorage()` 便于测试。任何实现了 `ChatStorage` 的对象都可以使用，同步或异步均可：

```ts
const storage: ChatStorage = {
  load: id => fetch(`/api/chats/${id}`).then(r => r.json()),
  save: (id, messages) => fetch(`/api/chats/${id}`, { method: 'PUT', body: JSON.stringify(messages) }).then(() => {}),
  remove: id => fetch(`/api/chats/${id}`, { method: 'DELETE' }).then(() => {}),
}
```

使用异步存储时，`isRestored` 在 `load` 完成之前为 `false`。在此之前发送的消息会被保留，已存储的历史记录不会覆盖它们。存储错误会交给 `onError` 处理。附件以 data URL 的形式存储，因此大文件可能会超出约 5 MB 的 localStorage 配额。

## 重试与限流

```ts
import { wrapProvider, retryMiddleware, rateLimitMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  retryMiddleware({ maxRetries: 3, initialDelay: 1000, maxDelay: 30_000 }),
  rateLimitMiddleware({ maxRequests: 20, interval: 60_000, maxConcurrent: 2 }),
])
```

`retryMiddleware` 会在遇到 408、409、429、5xx 和网络错误时，以指数退避（`initialDelay * factor^n`，带随机抖动）重新发送请求，并遵循 `Retry-After` / `retry-after-ms`。传入 `shouldRetry(error, attempt)` 可自定义策略，传入 `onRetry` 可观察重试。只会重试初始请求，流开始之后发生的错误不会重试。

`rateLimitMiddleware` 在客户端对请求排队：每个 `interval` 内最多 `maxRequests` 个请求，最多 `maxConcurrent` 个打开的流（流结束或被取消时释放槽位）。中止一个正在排队的请求会立即将其 reject。

提供方会抛出带有 `status`、`provider`、`body`、`retryAfter` 和 `isRetryable` 的 `LLMAPIError`：

```ts
import { LLMAPIError } from 'vue-llm'

onError(error) {
  if (error instanceof LLMAPIError && error.status === 429) showToast('Slow down')
}
```

在服务端，`createLLMHandler` 可以按客户端限制请求（默认以 `x-forwarded-for` / `x-real-ip` 作为键），超限时返回 `429` + `Retry-After`：

```ts
createLLMHandler({
  provider,
  rateLimit: { maxRequests: 10, interval: 60_000, key: req => req.headers.get('x-user-id') ?? 'anon' },
})
```

服务端限流器在每个实例的内存中计数。多实例部署时，请在处理器前面放置一个共享的限流器（例如基于 Redis 的）。

## 系统提示词

```ts
const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  system: 'You are a helpful assistant that speaks like a pirate.',
})
```

`system` 同样接受 ref 或 getter（在 `useChat`、`useCompletion` 和 `useObject` 中），并在每次请求时重新读取。

## 提示词模板

变量名会从模板字符串中推断出来，因此缺失或拼错的变量会成为类型错误：

```ts
import { createPrompt, createChatPrompt, usePrompt } from 'vue-llm'

const translate = createPrompt('Translate {{ text }} to {{lang}}.', { defaults: { lang: 'English' } })

translate.render({ text: 'Hola' })          // 'Translate Hola to English.'
translate.render({ txt: 'Hola' })           // ✗ type error
translate.variables                         // ['text', 'lang']
```

缺少值时运行时同样会抛出错误。用反斜杠转义占位符：`\{{literal}}`。

使用 `usePrompt` 创建响应式提示词：

```ts
const lang = ref('French')
const system = usePrompt('Always reply in {{lang}}.', () => ({ lang: lang.value }))

const chat = useChat({ provider: ai, model: 'gpt-4o', system })
```

多消息模板：

```ts
const tutor = createChatPrompt([
  { role: 'system', content: 'You are a {{level}} tutor.' },
  { role: 'user', content: 'Explain {{topic}}.' },
])

tutor.render({ level: 'patient', topic: 'recursion' })      // ChatMessage[] for provider.chat()
useChat({ provider: ai, model: 'gpt-4o', initialMessages: tutor.toUIMessages({ level: 'patient', topic: 'recursion' }) })
```

## API 参考

### `useChat(options)`

返回一个响应式的聊天接口。

**选项：**

| 选项 | 类型 | 说明 |
|--------|------|-------------|
| `provider` | `LLMProvider` | 提供方实例（必填） |
| `model` | `string` | 模型 ID（必填） |
| `system` | `MaybeRefOrGetter<string>` | 系统提示词 |
| `tools` | `ToolDefinition[]` | 可用的工具 |
| `onToolCall` | `(call) => unknown` | 工具调用处理函数 |
| `onFinish` | `(msg, ctx) => void` | 响应完成时调用 |
| `onError` | `(error) => void` | 错误处理函数 |
| `maxToolRoundtrips` | `number` | 工具调用的最大轮数（默认：5） |
| `storage` | `ChatStorage` | 按 `id` 持久化和恢复消息 |

**返回值：**

| 属性 | 类型 | 说明 |
|----------|------|-------------|
| `messages` | `Ref<UIMessage[]>` | 聊天消息 |
| `status` | `Ref<ChatStatus>` | `'ready' \| 'submitted' \| 'streaming' \| 'error'` |
| `error` | `Ref<Error \| undefined>` | 最近一次错误 |
| `input` | `Ref<string>` | 输入文本（v-model） |
| `isLoading` | `Ref<boolean>` | 是否有请求正在进行 |
| `sendMessage` | `(text? \| { text?, files? }) => Promise` | 发送消息，可附带附件 |
| `stop` | `() => void` | 中止当前的流 |
| `regenerate` | `() => Promise` | 删除最后一条助手消息并重新生成 |
| `setMessages` | `(msgs) => void` | 替换消息历史 |
| `handleSubmit` | `(event?: Event) => void` | 表单提交处理函数（发送 `input.value`） |
| `clearError` | `() => void` | 清除错误状态 |
| `isRestored` | `Ref<boolean>` | 异步存储加载期间为 `false` |

## Nuxt 模块

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

组合式函数和提供方工厂函数会被自动导入。

## 安全

未显式开启时，在浏览器中使用提供方会抛出错误：

```ts
// This will throw in browser:
const ai = createOpenAI({ apiKey: 'sk-...' })

// Opt-in for prototyping only:
const ai = createOpenAI({
  apiKey: 'sk-...',
  dangerouslyAllowBrowser: true,
})
```

在生产环境中，请通过你的服务器代理 API 调用，或者使用带 `runtimeConfig` 的 Nuxt 模块。

## 消息格式

消息采用基于 part 的格式来承载富内容：

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

## 许可证

MIT
