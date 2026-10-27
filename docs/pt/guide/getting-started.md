---
description: 'Instale o vue-llm e crie um chat de IA com streaming em Vue 3 ou Nuxt em poucas linhas com o useChat. Versões do Vue suportadas, pontos de entrada e formato das mensagens.'
---

# Primeiros passos

## Instalação {#installation}

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

`vue` é a única peer dependency; o pacote não tem nenhuma dependência de runtime.

## Versões do Vue {#vue-versions}

| | Vue 3.3+ | Vue 2.7 |
|---|---|---|
| Composables (`useChat`, `useCompletion`, `useObject`, `usePrompt`) | ✓ | ✓ |
| Provedores, middleware, storage, templates de prompt, servidor | ✓ | ✓ |
| `vue-llm/components` | ✓ | — |
| `vue-llm/nuxt` | Nuxt 3/4 | — |

O Vue 2.7 é suportado por meio da Composition API nativa — use os composables dentro de `setup()` (componentes com Options API também podem chamá-los em `setup()`). Toda a suíte de testes roda nas duas versões no CI. Vue 2.6 e anteriores não são suportados; atualizar para o 2.7 é uma atualização minor.

## Pontos de entrada {#entry-points}

| Import | Conteúdo |
|--------|----------|
| `vue-llm` | Composables, middleware, storage, templates de prompt, tipos |
| `vue-llm/providers` | `createOpenAI`, `createAnthropic`, `createGoogle`, `createOllama`, `createSSEProvider`, `createWebLLM`, `isWebGPUSupported` |
| `vue-llm/server` | `createLLMHandler`, `streamToSSE`, `createProxyProvider` |
| `vue-llm/nuxt` | Módulo Nuxt |
| `vue-llm/components` | Componentes Vue |
| `vue-llm/devtools` | Plugin do Vue DevTools |
| `vue-llm/style.css` | Estilos dos componentes |

## Seu primeiro chat {#your-first-chat}

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
Chamar provedores direto do navegador expõe sua API key. Em produção, rode o provedor em um servidor e use [`createProxyProvider`](./server) no cliente.
:::

## Formato das mensagens {#message-format}

As mensagens são compostas de partes, então texto, raciocínio, chamadas de ferramentas e arquivos podem conviver em uma única mensagem:

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
