---
description: '在 vue-llm 中使用 Nuxt UI 聊天组件（UChatMessages、UChatPrompt、UChatTool）：toUIMessages 将消息转换为 AI SDK 格式，Nuxt UI 的示例可直接使用。'
---

# Nuxt UI

[Nuxt UI](https://ui.nuxt.com) 提供了一组聊天组件——`UChatMessages`、`UChatPrompt`、`UChatPromptSubmit`、`UChatReasoning`、`UChatTool`、`UChatPalette`——它们是按照 Vercel AI SDK 的消息格式构建的。它们可以配合 vue-llm 的 `useChat` 使用；`toUIMessages` 负责转换消息，因此你可以直接复制 Nuxt UI 的示例和聊天模板。

无需安装 `ai` 或 `@ai-sdk/vue`。

## 示例 {#example}

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

`status`、`sendMessage`、`regenerate` 和 `stop` 的含义与 AI SDK 中相同，因此可以直接连接。助手文本可以使用 [`StreamMarkdown`](./components#streammarkdown)，或 Nuxt UI 自带的 Markdown 方案。

## toUIMessages 做了哪些转换 {#what-touimessages-changes}

text、reasoning 和 file 部分在两种格式中相同，会被直接复制。其余部分会被转换：

| vue-llm 部分 | AI SDK 部分 |
|---|---|
| 带有 `toolName`、`args`、`result`、`error` 的 `tool-call` | 带有 `input`、`output`、`errorText` 的 `tool-<toolName>` |
| 工具 `state`：`streaming` | `input-streaming` |
| `pending`、`running` | `input-available` |
| `result` | `output-available` |
| `error` | `output-error` |
| `source` | `source-url`（`sourceId` 即 URL） |
| 带有 `name` 的 `data` | `data-<name>` |

`id`、`role` 和 `metadata` 会保留。原始消息不会被修改：`toUIMessages` 是只读的，你仍然通过 `useChat` 操作聊天——例如，对于等待用户操作的工具，使用 `addToolResult({ toolCallId, result })`。

返回的类型 `AISDKUIMessage` 和 `AISDKUIPart` 描述了 AI SDK 的格式，且不依赖 `ai` 包。
