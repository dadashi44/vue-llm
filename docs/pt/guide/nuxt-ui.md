---
description: 'Use os componentes de chat do Nuxt UI (UChatMessages, UChatPrompt, UChatTool) com o vue-llm: toUIMessages converte as mensagens para o formato do AI SDK, então os exemplos do Nuxt UI funcionam como estão.'
---

# Nuxt UI

O [Nuxt UI](https://ui.nuxt.com) tem componentes de chat — `UChatMessages`, `UChatPrompt`, `UChatPromptSubmit`, `UChatReasoning`, `UChatTool`, `UChatPalette` — feitos para o formato de mensagens do Vercel AI SDK. Eles funcionam com o `useChat` do vue-llm; `toUIMessages` converte as mensagens para que você possa copiar os exemplos e o template de chat do Nuxt UI como estão.

Você não precisa instalar `ai` nem `@ai-sdk/vue`.

## Exemplo {#example}

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useChat, toUIMessages } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'
import { isPartStreaming, isToolStreaming } from '@nuxt/ui/utils/ai'

const chat = useChat({ provider: createProxyProvider('/api/chat'), model: 'gpt-4o' })
const messages = computed(() => toUIMessages(chat.messages.value))
</script>

<template>
  <UChatMessages :messages="messages" :status="chat.status.value">
    <template #part="{ part, streaming }">
      <UChatReasoning
        v-if="part.type === 'reasoning'"
        :text="part.text"
        :streaming="isPartStreaming(part, streaming)"
      />
      <UChatTool
        v-else-if="part.type.startsWith('tool-')"
        :text="part.type.slice(5)"
        :streaming="isToolStreaming(part, streaming)"
        :error="part.state === 'output-error'"
      />
      <p v-else-if="part.type === 'text'">{{ part.text }}</p>
    </template>
  </UChatMessages>

  <UChatPrompt v-model="chat.input.value" :status="chat.status.value" @submit="chat.sendMessage()">
    <UChatPromptSubmit :status="chat.status.value" @stop="chat.stop()" @reload="chat.regenerate()" />
  </UChatPrompt>
</template>
```

`status`, `sendMessage`, `regenerate` e `stop` têm o mesmo significado que no AI SDK, então se conectam diretamente. Use [`StreamMarkdown`](./components#streammarkdown) ou a configuração de Markdown do próprio Nuxt UI para o texto do assistente.

## O que o toUIMessages altera {#what-touimessages-changes}

As partes de texto, reasoning e arquivo são iguais nos dois formatos e são copiadas. O restante é convertido:

| Parte do vue-llm | Parte do AI SDK |
|---|---|
| `tool-call` com `toolName`, `args`, `result`, `error` | `tool-<toolName>` com `input`, `output`, `errorText` |
| `state` da ferramenta: `streaming` | `input-streaming` |
| `pending`, `running` | `input-available` |
| `result` | `output-available` |
| `error` | `output-error` |
| `source` | `source-url` (`sourceId` é a URL) |
| `data` com `name` | `data-<name>` |

`id`, `role` e `metadata` são mantidos. As mensagens originais não são alteradas: `toUIMessages` é somente leitura, e você continua controlando o chat pelo `useChat` — por exemplo, `addToolResult({ toolCallId, result })` para uma ferramenta que espera o usuário.

Os tipos retornados `AISDKUIMessage` e `AISDKUIPart` descrevem o formato do AI SDK sem depender do pacote `ai`.
