---
layout: home

hero:
  name: vue-llm
  text: Vue のための AI SDK
  tagline: ストリーミングチャット、Generative UI、ブラウザ内モデルを Vue コンポーザブルで。OpenAI、Anthropic、Gemini、Ollama、WebGPU に対応。
  actions:
    - theme: brand
      text: はじめる
      link: /ja/guide/getting-started
    - theme: alt
      text: ブラウザーで試す
      link: /ja/playground
    - theme: alt
      text: API リファレンス
      link: /ja/api/

features:
  - title: リアクティブなコンポーザブル
    details: ストリーミング、中断、再生成、ステータスの ref を備えた useChat、useCompletion、useObject。
  - title: マルチプロバイダー
    details: OpenAI、Anthropic、Google Gemini、Ollama を 1 つの LLMProvider インターフェースで。
  - title: ブラウザ内モデル
    details: createWebLLM で Llama、Qwen、SmolLM を WebGPU 上で実行。API キーもサーバーも不要で、データがタブの外に出ることはありません。
  - title: Generative UI
    details: ツール呼び出しを独自の Vue コンポーネントとして描画し、引数をストリーミングし、ユーザーにアクションを確認させられます。
  - title: ツール呼び出し
    details: execute を持つツールは自動で実行され、human-in-the-loop の呼び出しは addToolResult まで一時停止します。
  - title: 添付ファイル
    details: 画像、PDF、音声、テキストファイルを、各プロバイダーの形式に変換して送信します。
  - title: 永続化
    details: localStorage や任意の同期・非同期バックエンドからチャット履歴を復元します。
  - title: 高い耐障害性
    details: 指数バックオフによるリトライ、クライアントサイドとサーバーサイドのレート制限。
  - title: プロンプトテンプレート
    details: "型レベルで推論される {{variables}}、チャットテンプレート、リアクティブな usePrompt。"
  - title: あらゆるバックエンドに対応
    details: createLLMHandler でサーバーサイドのツールを実行したり、createSSEProvider で既存の SSE バックエンドに useChat を接続したりできます。
  - title: チャット UI
    details: "自分で所有できる完全なチャット。shadcn-vue CLI で追加するか、ヘッドレスな usePromptInput と useAutoScroll で独自に構築できます。"
  - title: DevTools
    details: Vue DevTools の LLM タブで、すべてのチャット、リクエストのタイムライン、最初のトークンまでの時間、ツール呼び出し、トークン使用量を確認できます。
  - title: サーバーと Nuxt
    details: Web 標準のリクエストハンドラー、プロキシプロバイダー、自動インポート付きの Nuxt モジュール。
---

## vue-llm とは？ {#what-is-vue-llm}

**vue-llm** は、**Vue 3** と **Nuxt** のアプリに AI・LLM 機能を追加するオープンソースの TypeScript ライブラリです。モデルの出力をリアクティブな状態にストリーミングする `useChat` などのコンポーザブル、**OpenAI、Anthropic Claude、Google Gemini、Ollama**、**ブラウザ内 WebGPU モデル** 向けのプロバイダー、そして **Generative UI** のためのコンポーネントを提供します。

```vue
<script setup lang="ts">
import { useChat } from 'vue-llm'
import { createSSEProvider } from 'vue-llm/providers'

const { messages, input, handleSubmit, status } = useChat({
  provider: createSSEProvider({ url: '/api/chat' }), // your server keeps the API key
  model: 'gpt-4o',
})
</script>

<template>
  <div v-for="m in messages" :key="m.id">{{ m.role }}: {{ m.parts.map(p => p.type === 'text' ? p.text : '').join('') }}</div>
  <form @submit="handleSubmit">
    <input v-model="input" :disabled="status === 'streaming'">
  </form>
</template>
```

## よくある質問 {#faq}

### vue-llm とは何ですか？ {#what-is-vue-llm-1}

vue-llm は、Vue と Nuxt のアプリに AI・LLM 機能を追加するオープンソースの TypeScript ライブラリです。モデルの出力をリアクティブな状態にストリーミングする useChat、useCompletion、useObject などのコンポーザブルに加え、OpenAI、Anthropic、Google Gemini、Ollama、ブラウザ内 WebGPU モデル向けのプロバイダーを提供します。

### Vue で ChatGPT のようなチャットを作るには？ {#how-do-i-build-a-chatgpt-like-chat-in-vue}

vue-llm をインストールし、プロバイダーを作成して（たとえば createLLMHandler によるサーバープロキシや、サーバー上の createOpenAI）、コンポーネントで useChat を呼び出します。useChat はリアクティブな messages、input、status、sendMessage を返し、応答をトークン単位でストリーミングします。

### API キーなしでブラウザー内で LLM を実行できますか？ {#can-i-run-an-llm-in-the-browser-without-an-api-key}

はい。createWebLLM は、Llama 3.2、Qwen、SmolLM などのオープンモデルを WebGPU を通じてユーザーの GPU 上で実行します。リクエストがデバイスの外に出ることはなく、サーバーも API キーも必要ありません。

### vue-llm は Nuxt で使えますか？ {#does-vue-llm-work-with-nuxt}

はい。nuxt.config の modules に 'vue-llm/nuxt' を追加すると、コンポーザブルとプロバイダーが自動インポートされ、チャットコンポーネントが登録されます。createLLMHandler を使えば、Nuxt のサーバールートをモデルへの安全なプロキシにできます。

### vue-llm は Vue 2 をサポートしていますか？ {#does-vue-llm-support-vue-2}

コンポーザブル（useChat、useCompletion、useObject、usePrompt）は Vue 2.7 と Vue 3.3 以降で動作します。コンポーネントには Vue 3 が必要です。

### vue-llm は Vercel AI SDK と何が違いますか？ {#how-is-vue-llm-different-from-the-vercel-ai-sdk}

vue-llm は Vue を第一に考えて作られています。Nuxt モジュール、Generative UI 用の Vue コンポーネント、ブラウザ内モデル向けの WebGPU プロバイダー、コンポーザブルの Vue 2.7 サポート、既存の Server-Sent Events バックエンド向けのプロバイダーを備え、Vue 以外のランタイム依存関係はありません。

### vue-llm は無料ですか？ {#is-vue-llm-free}

はい。vue-llm は MIT ライセンスで、商用利用も無料です。
