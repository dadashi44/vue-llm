---
description: 'vue-llm で Nuxt UI のチャットコンポーネント（UChatMessages、UChatPrompt、UChatTool）を使う：toUIMessages がメッセージを AI SDK の形式に変換するので、Nuxt UI のサンプルがそのまま動きます。'
---

# Nuxt UI

[Nuxt UI](https://ui.nuxt.com) には、Vercel AI SDK のメッセージ形式を前提としたチャットコンポーネント（`UChatMessages`、`UChatPrompt`、`UChatPromptSubmit`、`UChatReasoning`、`UChatTool`、`UChatPalette`）があります。これらは vue-llm の `useChat` と一緒に使えます。`toUIMessages` がメッセージを変換するので、Nuxt UI のサンプルやチャットテンプレートをそのままコピーできます。

`ai` や `@ai-sdk/vue` をインストールする必要はありません。

## 例 {#example}

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

`status`、`sendMessage`、`regenerate`、`stop` は AI SDK と同じ意味なので、そのまま接続できます。アシスタントのテキストには、[`StreamMarkdown`](./components#streammarkdown) か Nuxt UI 独自の Markdown 設定を使ってください。

## toUIMessages が変換する内容 {#what-touimessages-changes}

text、reasoning、file のパーツは両方の形式で同じなので、そのままコピーされます。それ以外は変換されます：

| vue-llm のパーツ | AI SDK のパーツ |
|---|---|
| `toolName`、`args`、`result`、`error` を持つ `tool-call` | `input`、`output`、`errorText` を持つ `tool-<toolName>` |
| ツールの `state`：`streaming` | `input-streaming` |
| `pending`、`running` | `input-available` |
| `result` | `output-available` |
| `error` | `output-error` |
| `source` | `source-url`（`sourceId` は URL） |
| `name` を持つ `data` | `data-<name>` |

`id`、`role`、`metadata` は保持されます。元のメッセージは変更されません。`toUIMessages` は読み取り専用で、チャットの操作は引き続き `useChat` で行います。たとえば、ユーザーの応答を待つツールには `addToolResult({ toolCallId, result })` を使います。

返される型 `AISDKUIMessage` と `AISDKUIPart` は、`ai` パッケージに依存せずに AI SDK の形式を表します。
