---
description: 'Nuxt module for vue-llm: auto-imported composables and providers, registered chat components and a server route for LLM calls.'
---

# Nuxt

Install the module with the Nuxt CLI:

```bash
npx nuxi module add vue-llm
```

Or add it yourself; `vue-llm` and `vue-llm/nuxt` both work:

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

The module:

- auto-imports `useChat`, `useCompletion`, `useObject`, `usePrompt`, `createPrompt`, `createChatPrompt`, `defineTool`;
- auto-imports the provider factories `createOpenAI`, `createAnthropic`, `createGoogle`, `createOllama`, `createSSEProvider`, `createWebLLM` and `isWebGPUSupported`;
- registers the [`<MessageParts>`](./generative-ui) and [`<StreamMarkdown>`](./components) components. A component of yours with the same name takes precedence;
- adds the components' stylesheet;
- in development, adds the [LLM tab to Vue DevTools](./devtools) when `@vue/devtools-api` is installed. Turn it off with `vueLlm: { devtools: false }`.

## Server route

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

## Page

```vue
<script setup lang="ts">
import { createProxyProvider } from 'vue-llm/server'

const { messages, input, handleSubmit } = useChat({
  provider: createProxyProvider('/api/chat'),
  model: 'gpt-4o',
})
</script>
```
