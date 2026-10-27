# vue-llm

[English](./README.md) · [Русский](./README.ru.md) · [简体中文](./README.zh-CN.md) · [Português](./README.pt-BR.md) · [Español](./README.es.md) · **日本語**

[![npm version](https://img.shields.io/npm/v/vue-llm.svg)](https://www.npmjs.com/package/vue-llm)
[![npm downloads](https://img.shields.io/npm/dm/vue-llm.svg)](https://www.npmjs.com/package/vue-llm)
[![CI](https://github.com/dadashi44/vue-llm/actions/workflows/ci.yml/badge.svg)](https://github.com/dadashi44/vue-llm/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/vue-llm.svg)](./LICENSE)

**vue-llm** は Vue と Nuxt のための AI SDK です。ストリーミング対応の `useChat`、ツール呼び出し、Generative UI、ブラウザ内モデルを、OpenAI、Anthropic、Gemini、Ollama、WebGPU 向けに提供します。

ストリーミング、ツール呼び出し、マルチプロバイダー対応の `useChat()` を、わずか 10 行のコードで。

**ドキュメント:** https://vue-llm.js.org/ja/ · **[ブラウザーで試す](https://vue-llm.js.org/ja/playground)** — API キーは不要です

## 機能

- **`useChat()`** — ストリーミング、中断、再生成に対応したリアクティブなコンポーザブル
- **マルチプロバイダー** — OpenAI、Anthropic、Gemini、Ollama にすぐに対応
- **ブラウザ内モデル** — `createWebLLM` で Llama、Qwen、SmolLM を WebGPU 上で実行。サーバーも API キーも不要
- **Generative UI** — `<MessageParts>` でツール呼び出しを独自の Vue コンポーネントとして描画。引数のストリーミングと human-in-the-loop に対応
- **ツール呼び出し** — `execute` 付きの `defineTool`、`onToolCall`、`addToolResult`
- **添付ファイル** — 画像、PDF、音声、テキストファイルを、プロバイダーごとの形式に変換
- **永続化** — localStorage や任意のカスタムバックエンドからチャット履歴を復元
- **耐障害性** — 指数バックオフによるリトライ、クライアントとサーバーでのレート制限
- **プロンプトテンプレート** — 型推論付きの `{{variables}}`、チャットテンプレート、リアクティブな `usePrompt`
- **あらゆるバックエンドに対応** — `createLLMHandler` によるサーバーサイドのツール、独自の SSE API 向けの `createSSEProvider`
- **ストリーミング** — SSE パーサー、テキスト・推論・ツール呼び出しの差分
- **セキュリティ** — `dangerouslyAllowBrowser` ガードで API キーを保護
- **チャット UI** — 自分で所有できる完全なチャット：`npx shadcn-vue add https://vue-llm.js.org/r/chat.json`。ヘッドレスな `usePromptInput` と `useAutoScroll` も利用可能
- **Vue DevTools** — すべてのチャット、リクエストのタイムライン、最初のトークンまでの時間、ツール呼び出し、トークン使用量を表示する LLM タブ（`vue-llm/devtools`）
- **Nuxt モジュール** — 自動インポート、コンポーネント、開発時の DevTools、サーバーサイドの runtime config
- **ランタイム依存ゼロ** — peer dependency は `vue` のみ（Vue 3.3 以降。コンポーザブルは Vue 2.7 でも動作）
- **TypeScript** — 完全な型安全性、型もエクスポート

## クイックスタート

```bash
npm install vue-llm
```

```vue
<script setup>
import { useChat } from 'vue-llm'
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: 'sk-...',
  dangerouslyAllowBrowser: true, // only for prototyping
})

const { messages, input, handleSubmit, isLoading } = useChat({
  provider: ai,
  model: 'gpt-4o',
})
</script>

<template>
  <div v-for="msg in messages" :key="msg.id">
    <strong>{{ msg.role }}:</strong>
    <span v-for="(part, i) in msg.parts" :key="i">
      <template v-if="part.type === 'text'">{{ part.text }}</template>
    </span>
  </div>

  <form @submit.prevent="handleSubmit">
    <input v-model="input" placeholder="Ask something..." />
    <button :disabled="isLoading">Send</button>
  </form>
</template>
```

## プロバイダー

### OpenAI

```ts
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})
```

### Anthropic

```ts
import { createAnthropic } from 'vue-llm/providers'

const ai = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'claude-sonnet-4-5',
})
```

### Ollama（ローカル）

```ts
import { createOllama } from 'vue-llm/providers'

const ai = createOllama() // localhost:11434 by default

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'llama3',
})
```

### ブラウザー内（WebGPU）

```ts
import { CreateMLCEngine } from '@mlc-ai/web-llm' // npm i @mlc-ai/web-llm
import { createWebLLM } from 'vue-llm/providers'

const ai = createWebLLM({
  createEngine: CreateMLCEngine,
  onProgress: ({ progress }) => console.log(`${Math.round(progress * 100)}%`),
})

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
})
```

モデルはユーザーの GPU 上で動作し、データがデバイスの外に出ることはありません。詳しくは [ブラウザ内モデル](https://vue-llm.js.org/ja/guide/in-browser) を参照してください。

## ツール呼び出し

```ts
const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: [
    {
      name: 'get_weather',
      description: 'Get weather for a city',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' },
        },
        required: ['city'],
      },
    },
  ],
  onToolCall: async ({ toolName, args }) => {
    if (toolName === 'get_weather') {
      return { temperature: 22, condition: 'sunny' }
    }
  },
  maxToolRoundtrips: 3,
})
```

## 添付ファイル

`sendMessage` に `File`、`FileList`、`FilePart` オブジェクトを渡します。ファイルは data URL として読み込まれ、ユーザーメッセージの `file` パーツとして保存されます。

```vue
<script setup lang="ts">
const { messages, input, sendMessage } = useChat({ provider: ai, model: 'gpt-4o' })
const files = ref<FileList>()

async function submit() {
  await sendMessage({ text: input.value, files: files.value })
  input.value = ''
  files.value = undefined
}
</script>

<template>
  <input type="file" multiple @change="files = ($event.target as HTMLInputElement).files ?? undefined">
  <input v-model="input" @keydown.enter="submit">
</template>
```

リモート URL も使えます：`sendMessage({ files: { type: 'file', mediaType: 'image/png', url: 'https://…' } })`。

| プロバイダー | 画像 | PDF | 音声 | テキスト | リモート URL |
|----------|--------|-----|-------|------|-------------|
| OpenAI | ✓ | ✓ | wav, mp3 | テキストとしてインライン展開 | 画像のみ |
| Anthropic | ✓ | ✓ | — | ✓（document） | 画像、PDF |
| Google | ✓ | ✓ | ✓ | ✓ | `fileData` URI |
| Ollama | ✓ | — | — | テキストとしてインライン展開 | — |

サポートされていない組み合わせの場合は、リクエストを送信する前にわかりやすいエラーがスローされます。

## 永続化

`storage` アダプターと固定の `id` を渡すと、履歴は初期化時に復元され、レスポンスが完了するたびに保存されます。

```ts
import { useChat, createWebStorage } from 'vue-llm'

const { messages, setMessages, isRestored } = useChat({
  id: 'support-chat',
  provider: ai,
  model: 'gpt-4o',
  storage: createWebStorage(), // localStorage, key `vue-llm:chat:support-chat`
})

setMessages([]) // clears history and removes the stored entry
```

`createWebStorage({ prefix, storage: sessionStorage })` でキーと保存先をカスタマイズできます。テストには `createMemoryStorage()` が便利です。`ChatStorage` を実装したオブジェクトであれば、同期・非同期を問わず使えます。

```ts
const storage: ChatStorage = {
  load: id => fetch(`/api/chats/${id}`).then(r => r.json()),
  save: (id, messages) => fetch(`/api/chats/${id}`, { method: 'PUT', body: JSON.stringify(messages) }).then(() => {}),
  remove: id => fetch(`/api/chats/${id}`, { method: 'DELETE' }).then(() => {}),
}
```

非同期ストレージの場合、`load` が解決されるまで `isRestored` は `false` です。それまでに送信されたメッセージは保持され、保存済みの履歴で上書きされることはありません。ストレージのエラーは `onError` に渡されます。添付ファイルは data URL として保存されるため、大きなファイルは localStorage の上限（約 5 MB）を超えることがあります。

## リトライとレート制限

```ts
import { wrapProvider, retryMiddleware, rateLimitMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  retryMiddleware({ maxRetries: 3, initialDelay: 1000, maxDelay: 30_000 }),
  rateLimitMiddleware({ maxRequests: 20, interval: 60_000, maxConcurrent: 2 }),
])
```

`retryMiddleware` は、408、409、429、5xx、ネットワークエラーの際に、指数バックオフ（`initialDelay * factor^n`、ジッター付き）でリクエストを再送します。`Retry-After` / `retry-after-ms` も尊重します。`shouldRetry(error, attempt)` でカスタマイズでき、`onRetry` で監視できます。リトライされるのは最初のリクエストのみで、ストリームが始まった後のエラーはリトライされません。

`rateLimitMiddleware` はクライアントサイドでリクエストをキューに入れます。`interval` あたり最大 `maxRequests` 件、同時に開いているストリームは最大 `maxConcurrent` 本です（スロットはストリームが終了するかキャンセルされると解放されます）。キューで待機中のリクエストを中断すると、すぐに reject されます。

プロバイダーは `status`、`provider`、`body`、`retryAfter`、`isRetryable` を持つ `LLMAPIError` をスローします。

```ts
import { LLMAPIError } from 'vue-llm'

onError(error) {
  if (error instanceof LLMAPIError && error.status === 429) showToast('Slow down')
}
```

サーバーでは、`createLLMHandler` でクライアントごとにリクエストを制限でき（デフォルトのキーは `x-forwarded-for` / `x-real-ip`）、超過時は `429` + `Retry-After` を返します。

```ts
createLLMHandler({
  provider,
  rateLimit: { maxRequests: 10, interval: 60_000, key: req => req.headers.get('x-user-id') ?? 'anon' },
})
```

サーバーのリミッターはインスタンスごとのインメモリー実装です。複数インスタンスで運用する場合は、共有のリミッター（Redis ベースなど）をハンドラーの前段に置いてください。

## システムプロンプト

```ts
const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  system: 'You are a helpful assistant that speaks like a pirate.',
})
```

`system` には ref やゲッターも渡せ（`useChat`、`useCompletion`、`useObject`）、リクエストのたびに読み直されます。

## プロンプトテンプレート

変数名はテンプレート文字列から推論されるため、変数の不足やスペルミスは型エラーになります。

```ts
import { createPrompt, createChatPrompt, usePrompt } from 'vue-llm'

const translate = createPrompt('Translate {{ text }} to {{lang}}.', { defaults: { lang: 'English' } })

translate.render({ text: 'Hola' })          // 'Translate Hola to English.'
translate.render({ txt: 'Hola' })           // ✗ type error
translate.variables                         // ['text', 'lang']
```

値が不足している場合は実行時にもエラーがスローされます。プレースホルダーはバックスラッシュでエスケープできます：`\{{literal}}`。

`usePrompt` によるリアクティブなプロンプト：

```ts
const lang = ref('French')
const system = usePrompt('Always reply in {{lang}}.', () => ({ lang: lang.value }))

const chat = useChat({ provider: ai, model: 'gpt-4o', system })
```

複数メッセージのテンプレート：

```ts
const tutor = createChatPrompt([
  { role: 'system', content: 'You are a {{level}} tutor.' },
  { role: 'user', content: 'Explain {{topic}}.' },
])

tutor.render({ level: 'patient', topic: 'recursion' })      // ChatMessage[] for provider.chat()
useChat({ provider: ai, model: 'gpt-4o', initialMessages: tutor.toUIMessages({ level: 'patient', topic: 'recursion' }) })
```

## API リファレンス

### `useChat(options)`

リアクティブなチャットインターフェースを返します。

**オプション:**

| オプション | 型 | 説明 |
|--------|------|-------------|
| `provider` | `LLMProvider` | プロバイダーのインスタンス（必須） |
| `model` | `string` | モデル ID（必須） |
| `system` | `MaybeRefOrGetter<string>` | システムプロンプト |
| `tools` | `ToolDefinition[]` | 利用可能なツール |
| `onToolCall` | `(call) => unknown` | ツール呼び出しのハンドラー |
| `onFinish` | `(msg, ctx) => void` | レスポンスの完了時に呼ばれる |
| `onError` | `(error) => void` | エラーハンドラー |
| `maxToolRoundtrips` | `number` | ツール呼び出しのラウンド数の上限（デフォルト: 5） |
| `storage` | `ChatStorage` | `id` ごとにメッセージを保存・復元する |

**戻り値:**

| プロパティ | 型 | 説明 |
|----------|------|-------------|
| `messages` | `Ref<UIMessage[]>` | チャットのメッセージ |
| `status` | `Ref<ChatStatus>` | `'ready' \| 'submitted' \| 'streaming' \| 'error'` |
| `error` | `Ref<Error \| undefined>` | 最後のエラー |
| `input` | `Ref<string>` | 入力テキスト（v-model） |
| `isLoading` | `Ref<boolean>` | リクエストが処理中かどうか |
| `sendMessage` | `(text? \| { text?, files? }) => Promise` | メッセージを送信する（添付ファイルも可） |
| `stop` | `() => void` | 現在のストリームを中断する |
| `regenerate` | `() => Promise` | 最後のアシスタントメッセージを削除して再生成します |
| `setMessages` | `(msgs) => void` | メッセージ履歴を置き換える |
| `handleSubmit` | `(event?: Event) => void` | フォーム送信ハンドラー（`input.value` を送信） |
| `clearError` | `() => void` | エラー状態をクリアする |
| `isRestored` | `Ref<boolean>` | 非同期ストレージの読み込み中は `false` |

## Nuxt モジュール

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['vue-llm/nuxt'],
  runtimeConfig: {
    vueLlm: {
      openaiApiKey: '',
      anthropicApiKey: '',
    },
  },
})
```

コンポーザブルとプロバイダーのファクトリーは自動インポートされます。

## セキュリティ

明示的に許可しないままブラウザーで使用すると、プロバイダーはエラーをスローします。

```ts
// This will throw in browser:
const ai = createOpenAI({ apiKey: 'sk-...' })

// Opt-in for prototyping only:
const ai = createOpenAI({
  apiKey: 'sk-...',
  dangerouslyAllowBrowser: true,
})
```

本番環境では、API 呼び出しをサーバー経由でプロキシするか、`runtimeConfig` とともに Nuxt モジュールを使用してください。

## メッセージ形式

メッセージは、リッチなコンテンツを扱うためにパーツベースの形式を採用しています。

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

## ライセンス

MIT
