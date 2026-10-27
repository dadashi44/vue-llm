---
description: 'Vue 用の既製の AI チャット UI：コマンド 1 つで shadcn-vue コンポーネントを追加してコードを自分のものにするか、ヘッドレスな usePromptInput と useAutoScroll コンポーザブルで独自に構築できます。'
---

# チャット UI

**自分で所有できる** 完全なチャットインターフェースです。コンポーネントは shadcn-vue CLI でプレーンな `.vue` ファイルとしてプロジェクトに追加されるため、他のコンポーネントと同じようにスタイルを変えたり書き直したりできます。間違えやすい振る舞いの部分は `vue-llm` パッケージに含まれており、パッケージとともに更新されます。

<ClientOnly>
  <ChatUIDemo />
</ClientOnly>

このデモはスクリプト化されたモデルを使っています。コンポーネントは CLI がインストールするものと同じです。

## 構成の分け方 {#how-it-is-split}

| 部分 | 置き場所 | 更新方法 |
|------|----------------|---------|
| `useChat`、プロバイダー、`StreamMarkdown` | `vue-llm` パッケージ | `npm update vue-llm` |
| `usePromptInput`、`useAutoScroll` | `vue-llm` パッケージ | `npm update vue-llm` |
| `Chat`、`ChatMessage`、`ChatPromptInput`、`ChatReasoning`、`ChatToolCall` | プロジェクトにコピーされる | 自分のコード。上流の変更を取り込むには `add` を再実行 |

## インストール {#install}

[shadcn-vue](https://www.shadcn-vue.com/docs/installation) のプロジェクト、つまり Tailwind CSS と `lib/utils.ts` が必要です。

```bash
npx shadcn-vue@latest add https://vue-llm.js.org/r/chat.json
```

CLI は `vue-llm` とアイコンライブラリ（デフォルトは Lucide。他のアイコンライブラリは CLI が対応付けます）をインストールし、コンポーネントを `components/ui/chat/` に書き出します。

## 使い方 {#usage}

```vue
<script setup lang="ts">
import { useChat } from 'vue-llm'
import { createSSEProvider } from 'vue-llm/providers'
import { Chat } from '@/components/ui/chat'

const chat = useChat({
  provider: createSSEProvider({ url: '/api/chat' }),
  model: 'gpt-4o',
})
</script>

<template>
  <div class="h-dvh">
    <Chat :chat="chat" :suggestions="['Summarize this page', 'Write a haiku']" />
  </div>
</template>
```

`Chat` は親要素いっぱいに広がるので、親要素に高さを指定してください。

### Generative UI

ツール用のコンポーネントを渡します。コンポーネントのないツールには、引数と結果を表示する折りたたみ可能なカード `ChatToolCall` が使われます。

```vue
<Chat :chat="chat" :components="{ get_weather: WeatherCard, confirm_booking: BookingCard }" />
```

ツールコンポーネントの書き方は [Generative UI](./generative-ui) を参照してください。

## コンポーネント {#components}

### Chat

チャット全体です。自動スクロール付きのメッセージリスト、提案付きの空の状態、入力中インジケーター、リトライ付きのエラー表示、最下部へのスクロールボタン、入力欄を含みます。

| プロパティ | 型 | 説明 |
|------|------|-------------|
| `chat` | `UseChatReturn` | `useChat` の戻り値 |
| `components` | `Record<string, Component>` | ツール名 → コンポーネント |
| `suggestions` | `string[]` | チャットが空の間に表示するプロンプト |
| `placeholder` | `string` | 入力欄のプレースホルダー |
| `accept` | `string \| false` | 受け付ける添付ファイル。`false` で添付ボタンを非表示にする |

`#empty` スロットで、空の状態の見出しを置き換えられます。

### ChatMessage

1 つのメッセージです。Markdown、推論、ツール呼び出し、画像とファイル、ソース、コピーと再生成のアクションを含みます。`tool-result` と `regenerate` を emit します。

### ChatPromptInput

内容に合わせて高さが伸びるテキストエリアで、添付ファイル（ファイル選択、ペースト、ドラッグ＆ドロップ）と送信・停止ボタンを備えています。`chat`、`placeholder`、`accept`、`maxFiles` を受け取ります。

### ChatReasoning

折りたたみ可能な推論表示です。モデルが考えている間は開き、回答が始まると折りたたまれます。

### ChatToolCall

ツール呼び出し用のフォールバックカードで、状態と折りたたみ可能な引数・結果を表示します。

## テーマ {#theming}

コンポーネントが使うのは shadcn のテーマトークン `background`、`foreground`、`primary`、`muted`、`border`、`ring`、`card`、`destructive` だけです。テーマとダークモードに追従します。上のデモで **Vue green** を試してみてください。

## Tailwind を使わない場合 {#without-tailwind}

レジストリは使いません。上記のコンポーネントの難しい部分を担うヘッドレスなコンポーザブルを使って、UI を構築します。

```vue
<script setup lang="ts">
import { useAutoScroll, useChat, usePromptInput } from 'vue-llm'

const chat = useChat({ provider, model: 'gpt-4o' })
const { input, messages } = chat
const prompt = usePromptInput(chat)
const { files, canSubmit, submit, removeFile, handlers, dropzone } = prompt
const scroll = useAutoScroll()
const { isAtBottom, scrollToBottom } = scroll
</script>

<template>
  <div :ref="scroll.container" class="messages">
    <MyMessage v-for="m in messages" :key="m.id" :message="m" />
  </div>
  <button v-if="!isAtBottom" @click="scrollToBottom('smooth')">↓</button>

  <form v-bind="dropzone" @submit.prevent="submit">
    <span v-for="f in files" :key="f.name">{{ f.name }} <button type="button" @click="removeFile(f)">×</button></span>
    <textarea :ref="prompt.textarea" v-model="input" rows="1" v-bind="handlers" />
    <button :disabled="!canSubmit">Send</button>
  </form>
</template>
```

テンプレート ref は、`container` を分割代入するのではなく `:ref="scroll.container"` でバインドしてください。Vite のテンプレートで有効になっている `noUnusedLocals` を使う `vue-tsc` は、文字列の `ref="container"` を使用箇所として数えません。

### usePromptInput(chat, options?)

- **Enter** で送信し、**Shift+Enter** で改行します。IME の変換（中国語、日本語、韓国語）を確定する Enter で送信されることはありません。
- テキストエリアは内容に合わせて `maxRows`（デフォルト `8`）まで高くなります。
- ファイルは `addFiles`（ファイル入力）、ペースト、`dropzone` 要素へのドラッグ＆ドロップから添付されます。`isDragging` を使えばドロップ用のオーバーレイを表示できます。
- `accept` と `maxFiles` で添付ファイルを絞り込み、`onReject(files, reason)` で拒否されたファイルが通知されます。
- `submit()` はテキストとファイルを送信し、両方をクリアします。チャットが処理中の間、`canSubmit` は false です。

Vue 2.7 では `v-bind` でリスナーが付与されないため、ハンドラーを明示的にバインドしてください（`@keydown="handlers.onKeydown" @paste="handlers.onPaste"`）。

### useAutoScroll(options?)

- メッセージのストリーミング中や、画像やコードブロックが大きくなる間も、リストを最下部に固定します。
- ユーザーが上にスクロールすると追従を止めるので、落ち着いて読めます。このとき `isAtBottom` は `false` になります。
- `scrollToBottom('smooth')` で再び最下部に固定します。
- `threshold`（デフォルト `48` px）は、最下部からどれだけ近ければ「最下部にいる」とみなすかを設定します。
