---
description: 'Чат-компоненты Nuxt UI (UChatMessages, UChatPrompt, UChatTool) с vue-llm: toUIMessages преобразует сообщения в формат AI SDK, так что примеры Nuxt UI работают как есть.'
---

# Nuxt UI

[Nuxt UI](https://ui.nuxt.com) содержит чат-компоненты — `UChatMessages`, `UChatPrompt`, `UChatPromptSubmit`, `UChatReasoning`, `UChatTool`, `UChatPalette` — рассчитанные на формат сообщений Vercel AI SDK. Они работают с `useChat` из vue-llm; `toUIMessages` преобразует сообщения, так что примеры и чат-шаблон Nuxt UI можно копировать как есть.

Устанавливать `ai` или `@ai-sdk/vue` не нужно.

## Пример {#example}

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useChat, toUIMessages } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'
import { isPartStreaming, isToolStreaming } from '@nuxt/ui/utils/ai'

const chat = useChat({ provider: createProxyProvider('/api/chat'), model: 'gpt-4o' })
const messages = computed(() => toUIMessages(chat.messages.value))
</script>

<template>
  <UChatMessages :messages="messages" :status="chat.status.value">
    <template #part="{ part, streaming }">
      <UChatReasoning
        v-if="part.type === 'reasoning'"
        :text="part.text"
        :streaming="isPartStreaming(part, streaming)"
      />
      <UChatTool
        v-else-if="part.type.startsWith('tool-')"
        :text="part.type.slice(5)"
        :streaming="isToolStreaming(part, streaming)"
        :error="part.state === 'output-error'"
      />
      <p v-else-if="part.type === 'text'">{{ part.text }}</p>
    </template>
  </UChatMessages>

  <UChatPrompt v-model="chat.input.value" :status="chat.status.value" @submit="chat.sendMessage()">
    <UChatPromptSubmit :status="chat.status.value" @stop="chat.stop()" @reload="chat.regenerate()" />
  </UChatPrompt>
</template>
```

`status`, `sendMessage`, `regenerate` и `stop` означают то же, что и в AI SDK, поэтому подключаются напрямую. Для текста ассистента используйте [`StreamMarkdown`](./components#streammarkdown) или собственную настройку Markdown в Nuxt UI.

## Что меняет toUIMessages {#what-touimessages-changes}

Части text, reasoning и file в обоих форматах одинаковы и копируются. Остальное преобразуется:

| Часть vue-llm | Часть AI SDK |
|---|---|
| `tool-call` с `toolName`, `args`, `result`, `error` | `tool-<toolName>` с `input`, `output`, `errorText` |
| tool `state`: `streaming` | `input-streaming` |
| `pending`, `running` | `input-available` |
| `result` | `output-available` |
| `error` | `output-error` |
| `source` | `source-url` (`sourceId` — это URL) |
| `data` с `name` | `data-<name>` |

`id`, `role` и `metadata` сохраняются. Исходные сообщения не меняются: `toUIMessages` только читает, а управлять чатом вы продолжаете через `useChat` — например, `addToolResult({ toolCallId, result })` для инструмента, который ждёт ответа пользователя.

Возвращаемые типы `AISDKUIMessage` и `AISDKUIPart` описывают формат AI SDK без зависимости от пакета `ai`.
