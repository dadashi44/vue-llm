---
description: 'useChat：LLM とのストリーミングチャットのためのリアクティブな Vue コンポーザブル。中断、再生成、添付ファイル、ツール呼び出し、永続化、ステータスの ref を備えています。'
---

# useChat

リアクティブな、ストリーミング対応のマルチターンチャットです。

```ts
import { useChat } from 'vue-llm'

const {
  messages, input, status, error, isLoading,
  sendMessage, handleSubmit, regenerate, stop, setMessages, addToolResult, clearError, isRestored,
} = useChat({ provider: ai, model: 'gpt-4o' })
```

## メッセージの送信 {#sending-messages}

```ts
await sendMessage('Hello!')                       // explicit text
await sendMessage()                               // uses input.value and clears it
await sendMessage({ text: 'What is this?', files }) // with attachments
handleSubmit(event)                               // form submit helper
```

## ステータス {#status}

`status` は `'ready' | 'submitted' | 'streaming' | 'error'` のいずれかです。`isLoading` は `submitted` または `streaming` の間 `true` になります。失敗すると `error` に `Error` が入り、`status` は `'error'` になります。リセットするには `clearError()` を呼び出します。

```vue
<p v-if="status === 'submitted'">Thinking…</p>
<p v-if="error">{{ error.message }} <button @click="regenerate">Retry</button></p>
```

## パーツの描画 {#rendering-parts}

```vue
<template v-for="(part, i) in msg.parts" :key="i">
  <p v-if="part.type === 'text'">{{ part.text }}</p>
  <details v-else-if="part.type === 'reasoning'"><summary>Reasoning</summary>{{ part.text }}</details>
  <img v-else-if="part.type === 'file' && part.mediaType.startsWith('image/')" :src="part.url">
  <code v-else-if="part.type === 'tool-call'">{{ part.toolName }} → {{ part.state }}</code>
</template>
```

## オプション {#options}

| オプション | 型 | 説明 |
|--------|------|-------------|
| `provider` | `LLMProvider` | プロバイダーのインスタンス（必須） |
| `model` | `string` | モデル ID（必須） |
| `id` | `string` | チャット ID。ストレージのキーにもなる |
| `system` | `MaybeRefOrGetter<string>` | システムプロンプト。リクエストのたびに読み直される |
| `initialMessages` | `UIMessage[]` | 初期の履歴 |
| `body` | `MaybeRef<Record<string, unknown>>` | リクエストごとにマージされる追加のプロバイダーオプション |
| `providerOptions` | `Record<string, unknown>` | 固定のプロバイダーオプション（`maxTokens` など） |
| `tools` | `ToolDefinition[]` | 利用可能なツール |
| `onToolCall` | `(call) => unknown` | ツール呼び出しを実行する |
| `maxToolRoundtrips` | `number` | 1 メッセージあたりのツールのラウンド数の上限（デフォルト `5`） |
| `storage` | `ChatStorage` | メッセージを保存・復元する |
| `onFinish` | `(message, { finishReason, usage }) => void` | 各レスポンスの後に呼ばれる |
| `onError` | `(error) => void` | ストリームとストレージのエラー |

## 戻り値 {#returns}

| プロパティ | 型 | 説明 |
|----------|------|-------------|
| `messages` | `Ref<UIMessage[]>` | チャット履歴 |
| `input` | `Ref<string>` | `v-model` でバインドする |
| `status` | `Ref<ChatStatus>` | リクエストのステータス |
| `error` | `Ref<Error \| undefined>` | 最後のエラー |
| `isLoading` | `Ref<boolean>` | リクエスト処理中 |
| `isRestored` | `Ref<boolean>` | 非同期ストレージの読み込み中は `false` |
| `sendMessage` | `(input?) => Promise<void>` | テキストやファイルを送信する |
| `handleSubmit` | `(event?) => void` | `input.value` を送信する |
| `regenerate` | `() => Promise<void>` | 最後のアシスタントメッセージを破棄して再実行する |
| `stop` | `() => void` | 現在のストリームを中断する |
| `setMessages` | `(msgs \| fn) => void` | 履歴を置き換える（`[]` でストレージをクリア） |
| `addToolResult` | `({ toolCallId, result }) => void` | ツールの結果を手動で渡す |
| `clearError` | `() => void` | エラー状態をリセットする |
