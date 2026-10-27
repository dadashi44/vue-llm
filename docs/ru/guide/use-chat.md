---
description: 'useChat: реактивный Vue-композабл для стримингового чата с LLM — с отменой, повторной генерацией, вложениями, вызовом инструментов, сохранением истории и ref-ами статуса.'
---

# useChat

Реактивный стриминговый многоходовый чат.

```ts
import { useChat } from 'vue-llm'

const {
  messages, input, status, error, isLoading,
  sendMessage, handleSubmit, regenerate, stop, setMessages, addToolResult, clearError, isRestored,
} = useChat({ provider: ai, model: 'gpt-4o' })
```

## Отправка сообщений {#sending-messages}

```ts
await sendMessage('Hello!')                       // явно заданный текст
await sendMessage()                               // берёт input.value и очищает его
await sendMessage({ text: 'What is this?', files }) // с вложениями
handleSubmit(event)                               // хелпер для отправки формы
```

## Статус {#status}

`status` принимает значения `'ready' | 'submitted' | 'streaming' | 'error'`. `isLoading` равен `true` в состояниях `submitted` и `streaming`. При сбое в `error` оказывается `Error`, а `status` становится `'error'`; вызовите `clearError()`, чтобы сбросить состояние.

```vue
<p v-if="status === 'submitted'">Thinking…</p>
<p v-if="error">{{ error.message }} <button @click="regenerate">Retry</button></p>
```

## Рендеринг частей {#rendering-parts}

```vue
<template v-for="(part, i) in msg.parts" :key="i">
  <p v-if="part.type === 'text'">{{ part.text }}</p>
  <details v-else-if="part.type === 'reasoning'"><summary>Reasoning</summary>{{ part.text }}</details>
  <img v-else-if="part.type === 'file' && part.mediaType.startsWith('image/')" :src="part.url">
  <code v-else-if="part.type === 'tool-call'">{{ part.toolName }} → {{ part.state }}</code>
</template>
```

## Опции {#options}

| Опция | Тип | Описание |
|--------|------|-------------|
| `provider` | `LLMProvider` | Экземпляр провайдера (обязательна) |
| `model` | `string` | ID модели (обязательна) |
| `id` | `string` | ID чата — он же ключ в хранилище |
| `system` | `MaybeRefOrGetter<string>` | Системный промпт, перечитывается при каждом запросе |
| `initialMessages` | `UIMessage[]` | Начальная история |
| `body` | `MaybeRef<Record<string, unknown>>` | Дополнительные опции провайдера, подмешиваются в каждый запрос |
| `providerOptions` | `Record<string, unknown>` | Статические опции провайдера (например, `maxTokens`) |
| `tools` | `ToolDefinition[]` | Доступные инструменты |
| `onToolCall` | `(call) => unknown` | Выполняет вызовы инструментов |
| `maxToolRoundtrips` | `number` | Максимум раундов инструментов на сообщение (по умолчанию `5`) |
| `storage` | `ChatStorage` | Сохранение и восстановление сообщений |
| `onFinish` | `(message, { finishReason, usage }) => void` | Вызывается после каждого ответа |
| `onError` | `(error) => void` | Ошибки потока и хранилища |

## Возвращаемые значения {#returns}

| Свойство | Тип | Описание |
|----------|------|-------------|
| `messages` | `Ref<UIMessage[]>` | История чата |
| `input` | `Ref<string>` | Привязывается через `v-model` |
| `status` | `Ref<ChatStatus>` | Статус запроса |
| `error` | `Ref<Error \| undefined>` | Последняя ошибка |
| `isLoading` | `Ref<boolean>` | Идёт запрос |
| `isRestored` | `Ref<boolean>` | `false`, пока загружается асинхронное хранилище |
| `sendMessage` | `(input?) => Promise<void>` | Отправляет текст и/или файлы |
| `handleSubmit` | `(event?) => void` | Отправляет `input.value` |
| `regenerate` | `() => Promise<void>` | Удаляет последнее сообщение ассистента и запускает генерацию заново |
| `stop` | `() => void` | Прерывает текущий поток |
| `setMessages` | `(msgs \| fn) => void` | Заменяет историю (`[]` очищает хранилище) |
| `addToolResult` | `({ toolCallId, result }) => void` | Передаёт результат инструмента вручную |
| `clearError` | `() => void` | Сбрасывает состояние ошибки |
