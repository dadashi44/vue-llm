---
description: 'Vue DevTools で LLM の呼び出しをデバッグ：すべての useChat、useCompletion、useObject を調べ、リクエスト、最初のトークンまでの時間、ツール呼び出し、トークン使用量をタイムラインで確認できます。'
---

# DevTools

`vue-llm/devtools` は [Vue DevTools](https://devtools.vuejs.org) に **LLM** タブを追加します。`console.log` を使わずに、アプリがモデルに何を送っているか、モデルの応答にどれだけ時間がかかるか、トークンをどれだけ使っているかを確認できます。

## セットアップ {#setup}

```bash
npm i -D @vue/devtools-api
```

```ts
// main.ts
import { createApp } from 'vue'
import { LLMDevtools } from 'vue-llm/devtools'
import App from './App.vue'

const app = createApp(App)
if (import.meta.env.DEV) app.use(LLMDevtools)
app.mount('#app')
```

**Nuxt** ではこの設定は不要です。開発時に `@vue/devtools-api` が利用可能であれば、モジュールがプラグインを自動でインストールします。無効にするには `vueLlm: { devtools: false }` を指定します。

Vue DevTools のブラウザー拡張機能、スタンドアロンアプリ、`vite-plugin-vue-devtools` で動作します。

## インスペクター {#inspector}

**LLM** タブには、現在動作しているすべての `useChat`、`useCompletion`、`useObject` が、ステータスとモデルのタグ付きで一覧表示されます。1 つ選択すると次の内容を確認できます。

| セクション | 内容 |
|---------|----------|
| state | ステータス、プロバイダー、モデル、最後のエラー |
| usage | リクエスト数、エラー数、プロンプトと補完のトークン数、直近の最初のトークンまでの時間、所要時間、トークン/秒 |
| messages | ツール呼び出し、引数、結果を含むチャット履歴 |
| output | 現在の補完結果または部分的なオブジェクト |

セッションにホバーするとアクションが表示されます。生成の **stop** とメッセージの **clear** です。

セッションを区別するには、コンポーザブルに `id` を渡します。

```ts
useChat({ id: 'support-chat', provider, model: 'gpt-4o' })
```

## タイムライン {#timeline}

各リクエストはタイムライン上で 1 つのグループになります。

```
request       openai · gpt-4o
first token   340 ms
tool: get_weather   {"city":"Oslo"}
finish        tool-calls · 910 ms · 512 tokens · 48 tok/s
```

エラーや中断されたリクエストはハイライト表示されます。イベントを選択すると、送信したメッセージ、ツールの引数と結果、使用量を確認できます。

::: tip 記録
Vue DevTools 7 以降では、プラグインのタイムラインは記録をオンにしたときだけ記録されます。**LLM → Timeline** を開き、右上の記録トグルをクリックしてください。
:::

## オプション {#options}

```ts
app.use(LLMDevtools, { logMessages: false })
```

| オプション | デフォルト | 説明 |
|--------|---------|-------------|
| `logMessages` | `true` | `request` イベントにメッセージ履歴全体を添付します。件数だけを記録するには `false` を指定します。 |

## コスト {#cost}

プラグインがない場合、コンポーザブルは計測処理をすべてスキップします。ストリームのラップも、イベントも、余分なオブジェクトもありません。`@vue/devtools-api` はオプションの peer dependency で、インポートするのは `vue-llm/devtools` だけなので、プラグインを使わない本番バンドルには含まれません。
