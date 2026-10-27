---
description: 'Instala vue-llm y crea un chat de IA con streaming en Vue 3 o Nuxt en pocas líneas con useChat. Versiones de Vue compatibles, puntos de entrada y formato de los mensajes.'
---

# Primeros pasos

## Instalación {#installation}

::: code-group

```bash [npm]
npm install vue-llm
```

```bash [pnpm]
pnpm add vue-llm
```

```bash [yarn]
yarn add vue-llm
```

:::

`vue` es la única peer dependency; el paquete no tiene dependencias en tiempo de ejecución.

## Versiones de Vue {#vue-versions}

| | Vue 3.3+ | Vue 2.7 |
|---|---|---|
| Composables (`useChat`, `useCompletion`, `useObject`, `usePrompt`) | ✓ | ✓ |
| Proveedores, middleware, almacenamiento, plantillas de prompts, servidor | ✓ | ✓ |
| `vue-llm/components` | ✓ | — |
| `vue-llm/nuxt` | Nuxt 3/4 | — |

Vue 2.7 es compatible gracias a su Composition API integrada: usa los composables en `setup()` (los componentes con Options API también pueden llamarlos en `setup()`). Toda la suite de tests se ejecuta en ambas versiones en CI. Vue 2.6 y anteriores no son compatibles; pasar a 2.7 es una actualización menor.

## Puntos de entrada {#entry-points}

| Import | Contenido |
|--------|----------|
| `vue-llm` | Composables, middleware, almacenamiento, plantillas de prompts, tipos |
| `vue-llm/providers` | `createOpenAI`, `createAnthropic`, `createGoogle`, `createOllama`, `createSSEProvider`, `createWebLLM`, `isWebGPUSupported` |
| `vue-llm/server` | `createLLMHandler`, `streamToSSE`, `createProxyProvider` |
| `vue-llm/nuxt` | Módulo de Nuxt |
| `vue-llm/components` | Componentes Vue |
| `vue-llm/devtools` | Plugin de Vue DevTools |
| `vue-llm/style.css` | Estilos de los componentes |

## Tu primer chat {#your-first-chat}

```vue
<script setup lang="ts">
import { useChat } from 'vue-llm'
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // prototyping only — see Security
})

const { messages, input, handleSubmit, isLoading, stop } = useChat({
  provider: ai,
  model: 'gpt-4o',
})
</script>

<template>
  <div v-for="msg in messages" :key="msg.id">
    <strong>{{ msg.role }}:</strong>
    <template v-for="(part, i) in msg.parts" :key="i">
      <span v-if="part.type === 'text'">{{ part.text }}</span>
    </template>
  </div>

  <form @submit.prevent="handleSubmit">
    <input v-model="input" placeholder="Ask something…">
    <button v-if="isLoading" type="button" @click="stop">Stop</button>
    <button v-else>Send</button>
  </form>
</template>
```

::: warning
Llamar a los proveedores desde el navegador expone tu API key. En producción, ejecuta el proveedor en un servidor y usa [`createProxyProvider`](./server) en el cliente.
:::

## Formato de los mensajes {#message-format}

Los mensajes se componen de partes, así que texto, razonamiento, llamadas a herramientas y archivos pueden convivir en un mismo mensaje:

```ts
interface UIMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: UIMessagePart[]
  metadata?: Record<string, unknown>
  createdAt?: Date
}

type UIMessagePart =
  | { type: 'text'; text: string; state?: 'streaming' | 'done' }
  | { type: 'reasoning'; text: string; state?: 'streaming' | 'done' }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown; state: 'streaming' | 'pending' | 'running' | 'result' | 'error'; result?: unknown; error?: string }
  | { type: 'file'; mediaType: string; url: string; filename?: string }
  | { type: 'source'; url: string; title?: string }
```
