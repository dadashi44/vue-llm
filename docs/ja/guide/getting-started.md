---
description: 'vue-llm をインストールし、useChat を使って Vue 3 や Nuxt でストリーミング AI チャットを数行で構築します。対応する Vue のバージョン、エントリーポイント、メッセージ形式も解説します。'
---

# はじめよう

## インストール {#installation}

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

peer dependency は `vue` のみで、ランタイム依存関係はありません。

## Vue のバージョン {#vue-versions}

| | Vue 3.3+ | Vue 2.7 |
|---|---|---|
| コンポーザブル（`useChat`、`useCompletion`、`useObject`、`usePrompt`） | ✓ | ✓ |
| プロバイダー、ミドルウェア、ストレージ、プロンプトテンプレート、サーバー | ✓ | ✓ |
| `vue-llm/components` | ✓ | — |
| `vue-llm/nuxt` | Nuxt 3/4 | — |

Vue 2.7 は組み込みの Composition API によってサポートされます。コンポーザブルは `setup()` の中で使用してください（Options API のコンポーネントでも `setup()` から呼び出せます）。CI ではテストスイート全体を両方のバージョンで実行しています。Vue 2.6 以前はサポートしていませんが、2.7 へのアップグレードはマイナーアップデートで済みます。

## エントリーポイント {#entry-points}

| インポート | 内容 |
|--------|----------|
| `vue-llm` | コンポーザブル、ミドルウェア、ストレージ、プロンプトテンプレート、型 |
| `vue-llm/providers` | `createOpenAI`、`createAnthropic`、`createGoogle`、`createOllama`、`createSSEProvider`、`createWebLLM`、`isWebGPUSupported` |
| `vue-llm/server` | `createLLMHandler`、`streamToSSE`、`createProxyProvider` |
| `vue-llm/nuxt` | Nuxt モジュール |
| `vue-llm/components` | Vue コンポーネント |
| `vue-llm/devtools` | Vue DevTools プラグイン |
| `vue-llm/style.css` | コンポーネントのスタイル |

## 最初のチャット {#your-first-chat}

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
ブラウザーからプロバイダーを呼び出すと API キーが露出します。本番環境ではプロバイダーをサーバー上で実行し、クライアントでは [`createProxyProvider`](./server) を使用してください。
:::

## メッセージ形式 {#message-format}

メッセージはパーツで構成されるため、テキスト、推論、ツール呼び出し、ファイルを 1 つのメッセージにまとめられます。

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
