---
description: 'useChat：用于与 LLM 进行流式聊天的响应式 Vue 组合式函数，支持中止、重新生成、附件、工具调用、持久化和状态 ref。'
---

# useChat

响应式的流式多轮聊天。

```ts
import { useChat } from 'vue-llm'

const {
  messages, input, status, error, isLoading,
  sendMessage, handleSubmit, regenerate, stop, setMessages, addToolResult, clearError, isRestored,
} = useChat({ provider: ai, model: 'gpt-4o' })
```

## 发送消息 {#sending-messages}

```ts
await sendMessage('Hello!')                       // explicit text
await sendMessage()                               // uses input.value and clears it
await sendMessage({ text: 'What is this?', files }) // with attachments
handleSubmit(event)                               // form submit helper
```

## 状态 {#status}

`status` 的取值为 `'ready' | 'submitted' | 'streaming' | 'error'`。在 `submitted` 或 `streaming` 期间，`isLoading` 为 `true`。失败时，`error` 保存该 `Error`，`status` 变为 `'error'`；调用 `clearError()` 可以重置。

```vue
<p v-if="status === 'submitted'">Thinking…</p>
<p v-if="error">{{ error.message }} <button @click="regenerate">Retry</button></p>
```

## 渲染 part {#rendering-parts}

```vue
<template v-for="(part, i) in msg.parts" :key="i">
  <p v-if="part.type === 'text'">{{ part.text }}</p>
  <details v-else-if="part.type === 'reasoning'"><summary>Reasoning</summary>{{ part.text }}</details>
  <img v-else-if="part.type === 'file' && part.mediaType.startsWith('image/')" :src="part.url">
  <code v-else-if="part.type === 'tool-call'">{{ part.toolName }} → {{ part.state }}</code>
</template>
```

## 选项 {#options}

| 选项 | 类型 | 说明 |
|--------|------|-------------|
| `provider` | `LLMProvider` | 提供方实例（必填） |
| `model` | `string` | 模型 ID（必填） |
| `id` | `string` | 聊天 ID，同时也是存储的键 |
| `system` | `MaybeRefOrGetter<string>` | 系统提示词，每次请求时重新读取 |
| `initialMessages` | `UIMessage[]` | 初始历史记录 |
| `body` | `MaybeRef<Record<string, unknown>>` | 每次请求时合并的额外提供方选项 |
| `providerOptions` | `Record<string, unknown>` | 静态的提供方选项（例如 `maxTokens`） |
| `tools` | `ToolDefinition[]` | 可用的工具 |
| `onToolCall` | `(call) => unknown` | 执行工具调用 |
| `maxToolRoundtrips` | `number` | 每条消息的最大工具调用轮数（默认 `5`） |
| `storage` | `ChatStorage` | 持久化和恢复消息 |
| `onFinish` | `(message, { finishReason, usage }) => void` | 每次响应结束后调用 |
| `onError` | `(error) => void` | 流和存储的错误 |

## 返回值 {#returns}

| 属性 | 类型 | 说明 |
|----------|------|-------------|
| `messages` | `Ref<UIMessage[]>` | 聊天历史记录 |
| `input` | `Ref<string>` | 通过 `v-model` 绑定 |
| `status` | `Ref<ChatStatus>` | 请求状态 |
| `error` | `Ref<Error \| undefined>` | 最近一次错误 |
| `isLoading` | `Ref<boolean>` | 是否有请求正在进行 |
| `isRestored` | `Ref<boolean>` | 异步存储加载期间为 `false` |
| `sendMessage` | `(input?) => Promise<void>` | 发送文本和/或文件 |
| `handleSubmit` | `(event?) => void` | 发送 `input.value` |
| `regenerate` | `() => Promise<void>` | 丢弃最后一条助手消息并重新运行 |
| `stop` | `() => void` | 中止当前的流 |
| `setMessages` | `(msgs \| fn) => void` | 替换历史记录（传入 `[]` 会清空存储） |
| `addToolResult` | `({ toolCallId, result }) => void` | 手动提供工具结果 |
| `clearError` | `() => void` | 重置错误状态 |
