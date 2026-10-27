---
description: 'Nuxt-модуль vue-llm: автоимпорт композаблов и провайдеров, зарегистрированные компоненты чата и серверный маршрут для вызовов LLM.'
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

Модуль:

- автоматически импортирует `useChat`, `useCompletion`, `useObject`, `usePrompt`, `createPrompt`, `createChatPrompt`, `defineTool`;
- автоматически импортирует фабрики провайдеров `createOpenAI`, `createAnthropic`, `createGoogle`, `createOllama`, `createSSEProvider`, `createWebLLM` и `isWebGPUSupported`;
- регистрирует компоненты [`<MessageParts>`](./generative-ui) и [`<StreamMarkdown>`](./components). Ваш компонент с тем же именем имеет приоритет;
- подключает таблицу стилей компонентов;
- в режиме разработки добавляет [вкладку LLM во Vue DevTools](./devtools), если установлен `@vue/devtools-api`. Отключается через `vueLlm: { devtools: false }`.

## Серверный маршрут {#server-route}

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

## Страница {#page}

```vue
<script setup lang="ts">
import { createProxyProvider } from 'vue-llm/server'

const { messages, input, handleSubmit } = useChat({
  provider: createProxyProvider('/api/chat'),
  model: 'gpt-4o',
})
</script>
```
