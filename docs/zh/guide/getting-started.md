---
description: '安装 vue-llm，借助 useChat 只需几行代码即可在 Vue 3 或 Nuxt 中构建流式 AI 聊天。包括支持的 Vue 版本、入口和消息格式。'
---

# 快速开始

## 安装 {#installation}

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

`vue` 是唯一的 peer 依赖；该包没有任何运行时依赖。

## Vue 版本 {#vue-versions}

| | Vue 3.3+ | Vue 2.7 |
|---|---|---|
| 组合式函数（`useChat`、`useCompletion`、`useObject`、`usePrompt`） | ✓ | ✓ |
| 提供方、中间件、存储、提示词模板、服务端 | ✓ | ✓ |
| `vue-llm/components` | ✓ | — |
| `vue-llm/nuxt` | Nuxt 3/4 | — |

Vue 2.7 通过其内置的组合式 API 获得支持：在 `setup()` 中使用这些组合式函数即可（选项式 API 组件同样可以在 `setup()` 中调用）。CI 会在两个版本上运行完整的测试套件。不支持 Vue 2.6 及更早版本；升级到 2.7 只是一次小版本更新。

## 入口 {#entry-points}

| 导入路径 | 内容 |
|--------|----------|
| `vue-llm` | 组合式函数、中间件、存储、提示词模板、类型 |
| `vue-llm/providers` | `createOpenAI`、`createAnthropic`、`createGoogle`、`createOllama`、`createSSEProvider`、`createWebLLM`、`isWebGPUSupported` |
| `vue-llm/server` | `createLLMHandler`、`streamToSSE`、`createProxyProvider` |
| `vue-llm/nuxt` | Nuxt 模块 |
| `vue-llm/components` | Vue 组件 |
| `vue-llm/devtools` | Vue DevTools 插件 |
| `vue-llm/style.css` | 组件样式 |

## 第一个聊天 {#your-first-chat}

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
在浏览器中直接调用提供方会暴露你的 API key。生产环境中请在服务端运行提供方，并在客户端使用 [`createProxyProvider`](./server)。
:::

## 消息格式 {#message-format}

消息由多个 part 组成，因此文本、推理、工具调用和文件可以放在同一条消息中：

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
