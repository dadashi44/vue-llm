---
description: 'Módulo Nuxt do vue-llm: composables e provedores com auto-import, componentes de chat registrados e uma rota de servidor para chamadas ao LLM.'
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

O módulo:

- importa automaticamente `useChat`, `useCompletion`, `useObject`, `usePrompt`, `createPrompt`, `createChatPrompt`, `defineTool`;
- importa automaticamente as factories de provedores `createOpenAI`, `createAnthropic`, `createGoogle`, `createOllama`, `createSSEProvider`, `createWebLLM` e `isWebGPUSupported`;
- registra os componentes [`<MessageParts>`](./generative-ui) e [`<StreamMarkdown>`](./components). Um componente seu com o mesmo nome tem prioridade;
- adiciona a folha de estilos dos componentes;
- em desenvolvimento, adiciona a [aba LLM ao Vue DevTools](./devtools) quando `@vue/devtools-api` está instalado. Desative com `vueLlm: { devtools: false }`.

## Rota de servidor {#server-route}

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

## Página {#page}

```vue
<script setup lang="ts">
import { createProxyProvider } from 'vue-llm/server'

const { messages, input, handleSubmit } = useChat({
  provider: createProxyProvider('/api/chat'),
  model: 'gpt-4o',
})
</script>
```
