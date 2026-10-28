---
description: 'Módulo de Nuxt para vue-llm: composables y proveedores con auto-import, componentes de chat registrados y una ruta de servidor para las llamadas al LLM.'
---

# Nuxt

Instala el módulo con la CLI de Nuxt:

```bash
npx nuxi module add vue-llm
```

O añádelo manualmente; funcionan tanto `vue-llm` como `vue-llm/nuxt`:

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

El módulo:

- importa automáticamente `useChat`, `useCompletion`, `useObject`, `usePrompt`, `createPrompt`, `createChatPrompt`, `defineTool`;
- importa automáticamente las factorías de proveedores `createOpenAI`, `createAnthropic`, `createGoogle`, `createOllama`, `createSSEProvider`, `createWebLLM` e `isWebGPUSupported`;
- registra los componentes [`<MessageParts>`](./generative-ui) y [`<StreamMarkdown>`](./components). Si tienes un componente propio con el mismo nombre, el tuyo tiene prioridad;
- añade la hoja de estilos de los componentes;
- en desarrollo, añade la [pestaña LLM a Vue DevTools](./devtools) cuando `@vue/devtools-api` está instalado. Desactívala con `vueLlm: { devtools: false }`.

## Ruta de servidor {#server-route}

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
