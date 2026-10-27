---
description: 'vue-llm 的 Nuxt 模块：自动导入组合式函数和提供方，注册聊天组件，并提供用于 LLM 调用的服务端路由。'
---

# Nuxt

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

该模块会：

- 自动导入 `useChat`、`useCompletion`、`useObject`、`usePrompt`、`createPrompt`、`createChatPrompt`、`defineTool`；
- 自动导入提供方工厂函数 `createOpenAI`、`createAnthropic`、`createGoogle`、`createOllama`、`createSSEProvider`、`createWebLLM` 和 `isWebGPUSupported`；
- 注册 [`<MessageParts>`](./generative-ui) 和 [`<StreamMarkdown>`](./components) 组件。你自己的同名组件优先级更高；
- 添加组件的样式表；
- 在开发环境中，如果安装了 `@vue/devtools-api`，会在 [Vue DevTools 中添加 LLM 标签页](./devtools)。可以通过 `vueLlm: { devtools: false }` 关闭。

## 服务端路由 {#server-route}

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

## 页面 {#page}

```vue
<script setup lang="ts">
import { createProxyProvider } from 'vue-llm/server'

const { messages, input, handleSubmit } = useChat({
  provider: createProxyProvider('/api/chat'),
  model: 'gpt-4o',
})
</script>
```
