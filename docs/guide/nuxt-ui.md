---
description: 'Use Nuxt UI chat components (UChatMessages, UChatPrompt, UChatTool) with vue-llm: toUIMessages converts messages to the AI SDK shape, so Nuxt UI examples work as they are.'
---

# Nuxt UI

[Nuxt UI](https://ui.nuxt.com) has chat components — `UChatMessages`, `UChatPrompt`, `UChatPromptSubmit`, `UChatReasoning`, `UChatTool`, `UChatPalette` — built for the message shape of the Vercel AI SDK. They work with `useChat` from vue-llm; `toUIMessages` converts the messages so you can copy Nuxt UI's examples and chat template as they are.

You don't need to install `ai` or `@ai-sdk/vue`.

## Example

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

`status`, `sendMessage`, `regenerate` and `stop` have the same meaning as in the AI SDK, so they connect directly. Use [`StreamMarkdown`](./components#streammarkdown) or Nuxt UI's own Markdown setup for assistant text.

## What toUIMessages changes

Text, reasoning and file parts are the same in both shapes and are copied. The rest is converted:

| vue-llm part | AI SDK part |
|---|---|
| `tool-call` with `toolName`, `args`, `result`, `error` | `tool-<toolName>` with `input`, `output`, `errorText` |
| tool `state`: `streaming` | `input-streaming` |
| `pending`, `running` | `input-available` |
| `result` | `output-available` |
| `error` | `output-error` |
| `source` | `source-url` (`sourceId` is the URL) |
| `data` with `name` | `data-<name>` |

`id`, `role` and `metadata` are kept. The original messages aren't changed: `toUIMessages` is read-only, and you keep acting on the chat through `useChat` — for example `addToolResult({ toolCallId, result })` for a tool waiting for the user.

The returned types `AISDKUIMessage` and `AISDKUIPart` describe the AI SDK shape without depending on the `ai` package.
