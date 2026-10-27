---
description: 'useChat: un composable reactivo de Vue para chat con LLM en streaming, con cancelación, regeneración, adjuntos, llamadas a herramientas, persistencia y refs de estado.'
---

# useChat

Chat multiturno reactivo y con streaming.

```ts
import { useChat } from 'vue-llm'

const {
  messages, input, status, error, isLoading,
  sendMessage, handleSubmit, regenerate, stop, setMessages, addToolResult, clearError, isRestored,
} = useChat({ provider: ai, model: 'gpt-4o' })
```

## Enviar mensajes {#sending-messages}

```ts
await sendMessage('Hello!')                       // explicit text
await sendMessage()                               // uses input.value and clears it
await sendMessage({ text: 'What is this?', files }) // with attachments
handleSubmit(event)                               // form submit helper
```

## Estado {#status}

`status` es `'ready' | 'submitted' | 'streaming' | 'error'`. `isLoading` es `true` mientras está en `submitted` o `streaming`. Si algo falla, `error` contiene el `Error` y `status` pasa a `'error'`; llama a `clearError()` para restablecerlo.

```vue
<p v-if="status === 'submitted'">Thinking…</p>
<p v-if="error">{{ error.message }} <button @click="regenerate">Retry</button></p>
```

## Renderizar las partes {#rendering-parts}

```vue
<template v-for="(part, i) in msg.parts" :key="i">
  <p v-if="part.type === 'text'">{{ part.text }}</p>
  <details v-else-if="part.type === 'reasoning'"><summary>Reasoning</summary>{{ part.text }}</details>
  <img v-else-if="part.type === 'file' && part.mediaType.startsWith('image/')" :src="part.url">
  <code v-else-if="part.type === 'tool-call'">{{ part.toolName }} → {{ part.state }}</code>
</template>
```

## Opciones {#options}

| Opción | Tipo | Descripción |
|--------|------|-------------|
| `provider` | `LLMProvider` | Instancia del proveedor (obligatoria) |
| `model` | `string` | ID del modelo (obligatorio) |
| `id` | `string` | ID del chat; también es la clave de almacenamiento |
| `system` | `MaybeRefOrGetter<string>` | Prompt de sistema, se vuelve a leer en cada petición |
| `initialMessages` | `UIMessage[]` | Historial inicial |
| `body` | `MaybeRef<Record<string, unknown>>` | Opciones extra del proveedor que se fusionan en cada petición |
| `providerOptions` | `Record<string, unknown>` | Opciones estáticas del proveedor (p. ej., `maxTokens`) |
| `tools` | `ToolDefinition[]` | Herramientas disponibles |
| `onToolCall` | `(call) => unknown` | Ejecuta las llamadas a herramientas |
| `maxToolRoundtrips` | `number` | Máximo de rondas de herramientas por mensaje (por defecto `5`) |
| `storage` | `ChatStorage` | Guarda y restaura los mensajes |
| `onFinish` | `(message, { finishReason, usage }) => void` | Se llama tras cada respuesta |
| `onError` | `(error) => void` | Errores del stream y del almacenamiento |

## Valores devueltos {#returns}

| Propiedad | Tipo | Descripción |
|----------|------|-------------|
| `messages` | `Ref<UIMessage[]>` | Historial del chat |
| `input` | `Ref<string>` | Vincúlalo con `v-model` |
| `status` | `Ref<ChatStatus>` | Estado de la petición |
| `error` | `Ref<Error \| undefined>` | Último error |
| `isLoading` | `Ref<boolean>` | Hay una petición en curso |
| `isRestored` | `Ref<boolean>` | `false` mientras carga el almacenamiento asíncrono |
| `sendMessage` | `(input?) => Promise<void>` | Envía texto y/o archivos |
| `handleSubmit` | `(event?) => void` | Envía `input.value` |
| `regenerate` | `() => Promise<void>` | Descarta el último mensaje del asistente y vuelve a ejecutar |
| `stop` | `() => void` | Cancela el stream actual |
| `setMessages` | `(msgs \| fn) => void` | Reemplaza el historial (`[]` vacía el almacenamiento) |
| `addToolResult` | `({ toolCallId, result }) => void` | Proporciona manualmente el resultado de una herramienta |
| `clearError` | `() => void` | Restablece el estado de error |
