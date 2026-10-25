# useChat

Reactive, streaming multi-turn chat.

```ts
import { useChat } from 'vue-llm'

const {
  messages, input, status, error, isLoading,
  sendMessage, handleSubmit, regenerate, stop, setMessages, addToolResult, clearError, isRestored,
} = useChat({ provider: ai, model: 'gpt-4o' })
```

## Sending messages

```ts
await sendMessage('Hello!')                       // explicit text
await sendMessage()                               // uses input.value and clears it
await sendMessage({ text: 'What is this?', files }) // with attachments
handleSubmit(event)                               // form submit helper
```

## Status

`status` is `'ready' | 'submitted' | 'streaming' | 'error'`. `isLoading` is `true` while `submitted` or `streaming`. On failure `error` holds the `Error` and `status` becomes `'error'`; call `clearError()` to reset.

```vue
<p v-if="status === 'submitted'">Thinking…</p>
<p v-if="error">{{ error.message }} <button @click="regenerate">Retry</button></p>
```

## Rendering parts

```vue
<template v-for="(part, i) in msg.parts" :key="i">
  <p v-if="part.type === 'text'">{{ part.text }}</p>
  <details v-else-if="part.type === 'reasoning'"><summary>Reasoning</summary>{{ part.text }}</details>
  <img v-else-if="part.type === 'file' && part.mediaType.startsWith('image/')" :src="part.url">
  <code v-else-if="part.type === 'tool-call'">{{ part.toolName }} → {{ part.state }}</code>
</template>
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `provider` | `LLMProvider` | Provider instance (required) |
| `model` | `string` | Model ID (required) |
| `id` | `string` | Chat ID — also the storage key |
| `system` | `MaybeRefOrGetter<string>` | System prompt, re-read on every request |
| `initialMessages` | `UIMessage[]` | Starting history |
| `body` | `MaybeRef<Record<string, unknown>>` | Extra provider options merged per request |
| `providerOptions` | `Record<string, unknown>` | Static provider options (e.g. `maxTokens`) |
| `tools` | `ToolDefinition[]` | Available tools |
| `onToolCall` | `(call) => unknown` | Executes tool calls |
| `maxToolRoundtrips` | `number` | Max tool rounds per message (default `5`) |
| `storage` | `ChatStorage` | Persist and restore messages |
| `onFinish` | `(message, { finishReason, usage }) => void` | Called after each response |
| `onError` | `(error) => void` | Stream and storage errors |

## Returns

| Property | Type | Description |
|----------|------|-------------|
| `messages` | `Ref<UIMessage[]>` | Chat history |
| `input` | `Ref<string>` | Bind with `v-model` |
| `status` | `Ref<ChatStatus>` | Request status |
| `error` | `Ref<Error \| undefined>` | Last error |
| `isLoading` | `Ref<boolean>` | Request in flight |
| `isRestored` | `Ref<boolean>` | `false` while async storage loads |
| `sendMessage` | `(input?) => Promise<void>` | Send text and/or files |
| `handleSubmit` | `(event?) => void` | Sends `input.value` |
| `regenerate` | `() => Promise<void>` | Drop the last assistant message and re-run |
| `stop` | `() => void` | Abort the current stream |
| `setMessages` | `(msgs \| fn) => void` | Replace history (`[]` clears storage) |
| `addToolResult` | `({ toolCallId, result }) => void` | Supply a tool result manually |
| `clearError` | `() => void` | Reset error state |
