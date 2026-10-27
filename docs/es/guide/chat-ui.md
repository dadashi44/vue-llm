---
description: 'Una interfaz de chat de IA lista para usar en Vue: añade componentes de shadcn-vue con un solo comando y quédate con el código, o construye la tuya con los composables headless usePromptInput y useAutoScroll.'
---

# Chat UI

Una interfaz de chat completa que es **tuya**. Los componentes se añaden a tu proyecto con la CLI de shadcn-vue como archivos `.vue` normales, así que puedes cambiarles el estilo o reescribirlos como cualquier otro componente. El comportamiento fácil de hacer mal viene en el paquete `vue-llm` y se actualiza con él.

<ClientOnly>
  <ChatUIDemo />
</ClientOnly>

La demo usa un modelo con guion. Los componentes son los mismos que instala la CLI.

## Cómo se reparte {#how-it-is-split}

| Parte | Dónde vive | Actualizaciones |
|------|----------------|---------|
| `useChat`, proveedores, `StreamMarkdown` | paquete `vue-llm` | `npm update vue-llm` |
| `usePromptInput`, `useAutoScroll` | paquete `vue-llm` | `npm update vue-llm` |
| `Chat`, `ChatMessage`, `ChatPromptInput`, `ChatReasoning`, `ChatToolCall` | copiados en tu proyecto | tu código; vuelve a ejecutar `add` para traer los cambios de upstream |

## Instalación {#install}

Necesitas un proyecto con [shadcn-vue](https://www.shadcn-vue.com/docs/installation), es decir, con Tailwind CSS y `lib/utils.ts`.

```bash
npx shadcn-vue@latest add https://vue-llm.js.org/r/chat.json
```

La CLI instala `vue-llm` y tu librería de iconos (Lucide por defecto; la CLI adapta otras librerías de iconos) y escribe los componentes en `components/ui/chat/`.

## Uso {#usage}

```vue
<script setup lang="ts">
import { useChat } from 'vue-llm'
import { createSSEProvider } from 'vue-llm/providers'
import { Chat } from '@/components/ui/chat'

const chat = useChat({
  provider: createSSEProvider({ url: '/api/chat' }),
  model: 'gpt-4o',
})
</script>

<template>
  <div class="h-dvh">
    <Chat :chat="chat" :suggestions="['Summarize this page', 'Write a haiku']" />
  </div>
</template>
```

`Chat` ocupa todo su contenedor, así que dale una altura al contenedor.

### Generative UI

Pasa componentes para tus herramientas. Las herramientas sin componente usan `ChatToolCall`, una tarjeta plegable con los argumentos y el resultado.

```vue
<Chat :chat="chat" :components="{ get_weather: WeatherCard, confirm_booking: BookingCard }" />
```

Consulta [Generative UI](./generative-ui) para escribir componentes de herramienta.

## Componentes {#components}

### Chat

El chat completo: lista de mensajes con auto-scroll, estado vacío con sugerencias, indicador de escritura, error con reintento, un botón para bajar al final y el campo de entrada.

| Prop | Tipo | Descripción |
|------|------|-------------|
| `chat` | `UseChatReturn` | El valor devuelto por `useChat` |
| `components` | `Record<string, Component>` | Nombre de herramienta → componente |
| `suggestions` | `string[]` | Prompts que se muestran mientras el chat está vacío |
| `placeholder` | `string` | Placeholder del campo de entrada |
| `accept` | `string \| false` | Adjuntos aceptados; `false` oculta el botón de adjuntar |

El slot `#empty` reemplaza el título del estado vacío.

### ChatMessage

Un mensaje: Markdown, razonamiento, llamadas a herramientas, imágenes y archivos, fuentes, y acciones para copiar y regenerar. Emite `tool-result` y `regenerate`.

### ChatPromptInput

Un textarea que crece solo, con adjuntos (selector de archivos, pegar y arrastrar y soltar) y botones de enviar y detener. Recibe `chat`, `placeholder`, `accept` y `maxFiles`.

### ChatReasoning

Razonamiento plegable. Se abre mientras el modelo piensa y se pliega cuando empieza la respuesta.

### ChatToolCall

La tarjeta por defecto para las llamadas a herramientas, con el estado y los argumentos y el resultado plegables.

## Temas {#theming}

Los componentes solo usan los tokens de tema de shadcn: `background`, `foreground`, `primary`, `muted`, `border`, `ring`, `card` y `destructive`. Siguen tu tema y el modo oscuro. Prueba **Vue green** en la demo de arriba.

## Sin Tailwind {#without-tailwind}

No uses el registry. Construye la UI con los composables headless, que contienen las partes difíciles de los componentes anteriores:

```vue
<script setup lang="ts">
import { useAutoScroll, useChat, usePromptInput } from 'vue-llm'

const chat = useChat({ provider, model: 'gpt-4o' })
const { input, messages } = chat
const prompt = usePromptInput(chat)
const { files, canSubmit, submit, removeFile, handlers, dropzone } = prompt
const scroll = useAutoScroll()
const { isAtBottom, scrollToBottom } = scroll
</script>

<template>
  <div :ref="scroll.container" class="messages">
    <MyMessage v-for="m in messages" :key="m.id" :message="m" />
  </div>
  <button v-if="!isAtBottom" @click="scrollToBottom('smooth')">↓</button>

  <form v-bind="dropzone" @submit.prevent="submit">
    <span v-for="f in files" :key="f.name">{{ f.name }} <button type="button" @click="removeFile(f)">×</button></span>
    <textarea :ref="prompt.textarea" v-model="input" rows="1" v-bind="handlers" />
    <button :disabled="!canSubmit">Send</button>
  </form>
</template>
```

Vincula los template refs con `:ref="scroll.container"` en lugar de desestructurar `container`. `vue-tsc` con `noUnusedLocals`, que las plantillas de Vite activan, no cuenta un string `ref="container"` como uso.

### usePromptInput(chat, options?)

- **Enter** envía y **Shift+Enter** añade un salto de línea. El Enter que confirma una composición IME (chino, japonés, coreano) nunca envía.
- El textarea crece con su contenido hasta `maxRows` (por defecto `8`).
- Los archivos se adjuntan desde `addFiles` (inputs de archivo), al pegar y al arrastrar y soltar sobre el elemento `dropzone`. `isDragging` te permite mostrar una capa para soltar.
- `accept` y `maxFiles` filtran los adjuntos, y `onReject(files, reason)` informa de los rechazados.
- `submit()` envía el texto y los archivos y vacía ambos. `canSubmit` es false mientras el chat está ocupado.

En Vue 2.7, vincula los manejadores explícitamente (`@keydown="handlers.onKeydown" @paste="handlers.onPaste"`), porque ahí `v-bind` no añade listeners.

### useAutoScroll(options?)

- Mantiene la lista pegada abajo mientras llegan los mensajes por streaming y mientras crecen las imágenes o los bloques de código.
- Deja de seguir cuando el usuario sube, para que pueda leer. `isAtBottom` pasa a `false`.
- `scrollToBottom('smooth')` la vuelve a fijar abajo.
- `threshold` (por defecto `48` px) define a qué distancia del final todavía se considera "abajo del todo".
