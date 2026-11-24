---
description: 'Usa los componentes de chat de Nuxt UI (UChatMessages, UChatPrompt, UChatTool) con vue-llm: toUIMessages convierte los mensajes al formato del AI SDK, así que los ejemplos de Nuxt UI funcionan tal cual.'
---

# Nuxt UI

[Nuxt UI](https://ui.nuxt.com) incluye componentes de chat — `UChatMessages`, `UChatPrompt`, `UChatPromptSubmit`, `UChatReasoning`, `UChatTool`, `UChatPalette` — pensados para el formato de mensajes del Vercel AI SDK. Funcionan con el `useChat` de vue-llm; `toUIMessages` convierte los mensajes para que puedas copiar los ejemplos y la plantilla de chat de Nuxt UI tal cual.

No necesitas instalar `ai` ni `@ai-sdk/vue`.

## Ejemplo {#example}

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

`status`, `sendMessage`, `regenerate` y `stop` significan lo mismo que en el AI SDK, así que se conectan directamente. Usa [`StreamMarkdown`](./components#streammarkdown) o la configuración de Markdown de Nuxt UI para el texto del asistente.

## Qué cambia toUIMessages {#what-touimessages-changes}

Las partes de texto, reasoning y archivo son iguales en ambos formatos y se copian. El resto se convierte:

| Parte de vue-llm | Parte del AI SDK |
|---|---|
| `tool-call` con `toolName`, `args`, `result`, `error` | `tool-<toolName>` con `input`, `output`, `errorText` |
| `state` de la herramienta: `streaming` | `input-streaming` |
| `pending`, `running` | `input-available` |
| `result` | `output-available` |
| `error` | `output-error` |
| `source` | `source-url` (`sourceId` es la URL) |
| `data` con `name` | `data-<name>` |

`id`, `role` y `metadata` se conservan. Los mensajes originales no se modifican: `toUIMessages` es de solo lectura, y sigues actuando sobre el chat con `useChat` — por ejemplo, `addToolResult({ toolCallId, result })` para una herramienta que espera al usuario.

Los tipos devueltos `AISDKUIMessage` y `AISDKUIPart` describen el formato del AI SDK sin depender del paquete `ai`.
