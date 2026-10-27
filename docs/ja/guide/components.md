---
description: 'MessageParts と StreamMarkdown：ストリーミング中の LLM メッセージ、安全な Markdown、推論、ツール呼び出しを描画する Vue コンポーネント。'
---

# コンポーネント

```ts
import { MessageParts, StreamMarkdown } from 'vue-llm/components'
import 'vue-llm/style.css' // cursor animation and small layout defaults
```

Nuxt モジュールを使うと、両方のコンポーネントとスタイルシートが自動で登録されます。

スタイル付きの完全なチャットインターフェースについては [チャット UI](./chat-ui) を参照してください。

::: info
コンポーネントには Vue 3 が必要です。Vue 2.7 では、プレーンな TypeScript である `renderMarkdown` を `v-html` と組み合わせて使用してください。
:::

## MessageParts

メッセージ全体を描画します。Markdown テキスト、折りたたみ可能な推論、画像、ソース、そして独自のコンポーネントによるツール呼び出しを扱います。[Generative UI](./generative-ui) を参照してください。

```vue
<MessageParts
  v-for="msg in messages"
  :key="msg.id"
  :message="msg"
  :components="{ get_weather: WeatherCard }"
  @tool-result="addToolResult"
/>
```

| プロパティ / イベント | 説明 |
|------|-------------|
| `message` | `UIMessage` |
| `components` | ツール名 → コンポーネント。コンポーネントは `ToolComponentProps` を受け取る |
| `render` | カスタムの Markdown レンダラー（`StreamMarkdown` と同様） |
| `@tool-result` | ツールコンポーネントが `addResult` を呼び出したときに `{ toolCallId, result }` とともに発火する |
| `#tool` スロット | コンポーネントのないツールのフォールバック：`{ part, addResult }` |

ルート要素には `class="vue-llm-message"` と、メッセージのロールを値とする `data-role` が設定されます。各パーツには `vue-llm-text`、`vue-llm-reasoning`、`vue-llm-file`、`vue-llm-source` クラスが付くので、自由にスタイルを当てられます。

## StreamMarkdown

モデルからの Markdown を、ストリーミング中に点滅するカーソル付きで描画します。

```vue
<script setup lang="ts">
const { messages, status } = useChat({ provider: ai, model: 'gpt-4o' })
</script>

<template>
  <div v-for="msg in messages" :key="msg.id">
    <template v-for="(part, i) in msg.parts" :key="i">
      <StreamMarkdown
        v-if="part.type === 'text'"
        :content="part.text"
        :streaming="part.state === 'streaming'"
      />
    </template>
  </div>
</template>
```

| プロパティ | 型 | 説明 |
|------|------|-------------|
| `content` | `string` | Markdown のソース |
| `streaming` | `boolean` | カーソルを表示する |
| `render` | `(markdown: string) => string` | 組み込みのレンダラーを置き換える |

組み込みのレンダラーは依存関係を持たず、見出し、段落、太字/斜体/取り消し線、インラインコード、フェンスで囲まれたコードブロック（シンタックスハイライター向けの `language-*` クラス付き）、リスト、引用、テーブル、水平線、リンク、画像をサポートします。閉じられていないコードフェンスもコードとして描画されるため、ストリーミング途中のスニペットも正しく表示されます。

### セキュリティ {#security}

モデルの出力は信頼できないものとして扱います。組み込みのレンダラーは次のように動作します。

- すべてのテキストをエスケープするため、`<script>` や `<img onerror>` のような生の HTML はテキストとして表示され、パースされることはありません。
- リンクと画像には `http(s):`、`mailto:`、相対 URL のみを許可し、`javascript:`、`data:`、プロトコル相対 URL などは除去します。
- リンクを `target="_blank" rel="noopener noreferrer"` で開きます。

カスタムの `render` 関数の出力は、vue-llm によるサニタイズが **行われません**。フル機能の Markdown ライブラリを使う場合は、その出力をサニタイズしてください。

```ts
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const render = (md: string) => DOMPurify.sanitize(marked.parse(md) as string)
```

```vue
<StreamMarkdown :content="text" :render="render" />
```

レンダラーはコンポーネントの外でも使えるようにエクスポートされています。

```ts
import { renderMarkdown } from 'vue-llm/components'

const html = renderMarkdown('**Hello**') // '<p><strong>Hello</strong></p>'
```
