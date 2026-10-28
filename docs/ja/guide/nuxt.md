---
description: 'vue-llm の Nuxt モジュール：コンポーザブルとプロバイダーの自動インポート、チャットコンポーネントの登録、LLM 呼び出し用のサーバールート。'
---

# Nuxt

Nuxt CLI でモジュールをインストールします：

```bash
npx nuxi module add vue-llm
```

手動で追加することもできます。`vue-llm` と `vue-llm/nuxt` のどちらでも動作します：

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['vue-llm/nuxt'],
  runtimeConfig: {
    vueLlm: {
      openaiApiKey: '', // NUXT_VUE_LLM_OPENAI_API_KEY
      anthropicApiKey: '', // NUXT_VUE_LLM_ANTHROPIC_API_KEY
    },
  },
})
```

このモジュールは次のことを行います。

- `useChat`、`useCompletion`、`useObject`、`usePrompt`、`createPrompt`、`createChatPrompt`、`defineTool` を自動インポートします。
- プロバイダーのファクトリー `createOpenAI`、`createAnthropic`、`createGoogle`、`createOllama`、`createSSEProvider`、`createWebLLM` と `isWebGPUSupported` を自動インポートします。
- [`<MessageParts>`](./generative-ui) と [`<StreamMarkdown>`](./components) コンポーネントを登録します。同じ名前の独自コンポーネントがある場合は、そちらが優先されます。
- コンポーネントのスタイルシートを追加します。
- 開発時に `@vue/devtools-api` がインストールされていれば、[Vue DevTools に LLM タブ](./devtools) を追加します。無効にするには `vueLlm: { devtools: false }` を指定します。

## サーバールート {#server-route}

```ts
// server/api/chat.post.ts
import { createLLMHandler } from 'vue-llm/server'
import { createOpenAI } from 'vue-llm/providers'

const config = useRuntimeConfig()

const handler = createLLMHandler({
  provider: createOpenAI({ apiKey: config.vueLlm.openaiApiKey }),
  model: 'gpt-4o',
})

export default defineEventHandler(event => handler(toWebRequest(event)))
```

## ページ {#page}

```vue
<script setup lang="ts">
import { createProxyProvider } from 'vue-llm/server'

const { messages, input, handleSubmit } = useChat({
  provider: createProxyProvider('/api/chat'),
  model: 'gpt-4o',
})
</script>
```
