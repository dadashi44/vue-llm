---
description: 'MessageParts y StreamMarkdown: componentes Vue que renderizan mensajes de LLM en streaming, Markdown seguro, razonamiento y llamadas a herramientas.'
---

# Componentes

```ts
import { MessageParts, StreamMarkdown } from 'vue-llm/components'
import 'vue-llm/style.css' // cursor animation and small layout defaults
```

El módulo de Nuxt registra ambos componentes y la hoja de estilos por ti.

Para una interfaz de chat completa y con estilos, consulta [Chat UI](./chat-ui).

::: info
Los componentes requieren Vue 3. En Vue 2.7, usa `renderMarkdown` con `v-html`: es TypeScript puro.
:::

## MessageParts

Renderiza un mensaje completo: texto en Markdown, razonamiento plegable, imágenes, fuentes y llamadas a herramientas mediante tus propios componentes. Consulta [Generative UI](./generative-ui).

```vue
<MessageParts
  v-for="msg in messages"
  :key="msg.id"
  :message="msg"
  :components="{ get_weather: WeatherCard }"
  @tool-result="addToolResult"
/>
```

| Prop / evento | Descripción |
|------|-------------|
| `message` | Un `UIMessage` |
| `components` | Nombre de herramienta → componente. Recibe `ToolComponentProps` |
| `render` | Renderizador de Markdown personalizado, como en `StreamMarkdown` |
| `@tool-result` | Se emite con `{ toolCallId, result }` cuando un componente de herramienta llama a `addResult` |
| Slot `#tool` | Alternativa para herramientas sin componente: `{ part, addResult }` |

El elemento raíz tiene `class="vue-llm-message"` y `data-role` con el rol del mensaje. Las partes usan las clases `vue-llm-text`, `vue-llm-reasoning`, `vue-llm-file` y `vue-llm-source`, para que puedas darles estilo.

## StreamMarkdown

Renderiza el Markdown del modelo mientras llega por streaming, con un cursor parpadeante.

```vue
<script setup lang="ts">
const { messages, status } = useChat({ provider: ai, model: 'gpt-4o' })
</script>

<template>
  <div v-for="msg in messages" :key="msg.id">
    <template v-for="(part, i) in msg.parts" :key="i">
      <StreamMarkdown
        v-if="part.type === 'text'"
        :content="part.text"
        :streaming="part.state === 'streaming'"
      />
    </template>
  </div>
</template>
```

| Prop | Tipo | Descripción |
|------|------|-------------|
| `content` | `string` | Código fuente Markdown |
| `streaming` | `boolean` | Muestra el cursor |
| `render` | `(markdown: string) => string` | Reemplaza el renderizador integrado |

El renderizador integrado no tiene dependencias y admite encabezados, párrafos, negrita/cursiva/tachado, código en línea, bloques de código delimitados (clase `language-*` para resaltadores), listas, citas, tablas, líneas horizontales, enlaces e imágenes. Un bloque de código sin cerrar se renderiza como código, así que los fragmentos a medio transmitir se ven bien.

### Seguridad {#security}

La salida del modelo no es de confianza. El renderizador integrado:

- escapa todo el texto, así que el HTML en bruto como `<script>` o `<img onerror>` se muestra como texto y nunca se interpreta;
- solo permite URLs `http(s):`, `mailto:` y relativas en enlaces e imágenes, y descarta `javascript:`, `data:`, las URLs relativas al protocolo y cualquier otra;
- abre los enlaces con `target="_blank" rel="noopener noreferrer"`.

vue-llm **no** sanea una función `render` personalizada. Si usas una librería de Markdown completa, sanea su salida:

```ts
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const render = (md: string) => DOMPurify.sanitize(marked.parse(md) as string)
```

```vue
<StreamMarkdown :content="text" :render="render" />
```

El renderizador también se exporta para usarlo fuera del componente:

```ts
import { renderMarkdown } from 'vue-llm/components'

const html = renderMarkdown('**Hello**') // '<p><strong>Hello</strong></p>'
```
