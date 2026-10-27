# vue-llm

[English](./README.md) · [Русский](./README.ru.md) · [简体中文](./README.zh-CN.md) · [Português](./README.pt-BR.md) · **Español** · [日本語](./README.ja.md)

[![npm version](https://img.shields.io/npm/v/vue-llm.svg)](https://www.npmjs.com/package/vue-llm)
[![npm downloads](https://img.shields.io/npm/dm/vue-llm.svg)](https://www.npmjs.com/package/vue-llm)
[![CI](https://github.com/dadashi44/vue-llm/actions/workflows/ci.yml/badge.svg)](https://github.com/dadashi44/vue-llm/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/vue-llm.svg)](./LICENSE)

**vue-llm** es el AI SDK para Vue y Nuxt: `useChat` con streaming, llamadas a herramientas, Generative UI y modelos en el navegador para OpenAI, Anthropic, Gemini, Ollama y WebGPU.

`useChat()` con streaming, llamadas a herramientas y varios proveedores, en 10 líneas de código.

**Documentación:** https://dadashi44.github.io/vue-llm/es/ · **[Pruébalo en el navegador](https://dadashi44.github.io/vue-llm/es/playground)**, sin API key

## Funciones

- **`useChat()`**: composable reactivo con streaming, cancelación y regeneración
- **Varios proveedores**: OpenAI, Anthropic, Gemini y Ollama listos para usar
- **Modelos en el navegador**: ejecuta Llama, Qwen o SmolLM sobre WebGPU con `createWebLLM`, sin servidor ni API key
- **Generative UI**: renderiza las llamadas a herramientas como tus componentes Vue con `<MessageParts>`, con argumentos en streaming e intervención humana
- **Llamadas a herramientas**: `defineTool` con `execute`, `onToolCall`, `addToolResult`
- **Adjuntos**: imágenes, PDF, audio y archivos de texto, adaptados a cada proveedor
- **Persistencia**: restaura el historial del chat desde localStorage o cualquier backend propio
- **Resiliencia**: reintentos con backoff exponencial y límites de peticiones en cliente y servidor
- **Plantillas de prompts**: `{{variables}}` con inferencia de tipos, plantillas de chat y `usePrompt` reactivo
- **Cualquier backend**: herramientas de servidor en `createLLMHandler` y `createSSEProvider` para tu propia API SSE
- **Streaming**: parser de SSE y deltas de texto, razonamiento y llamadas a herramientas
- **Seguridad**: la protección `dangerouslyAllowBrowser` mantiene a salvo las API keys
- **Chat UI**: un chat completo que es tuyo: `npx shadcn-vue add https://dadashi44.github.io/vue-llm/r/chat.json`, además de los headless `usePromptInput` y `useAutoScroll`
- **Vue DevTools**: una pestaña LLM con cada chat, línea de tiempo de peticiones, tiempo hasta el primer token, llamadas a herramientas y consumo de tokens (`vue-llm/devtools`)
- **Módulo de Nuxt**: auto-imports, componentes, DevTools en desarrollo y runtime config en el servidor
- **Cero dependencias en tiempo de ejecución**: solo `vue` como peer dependency (Vue 3.3+; los composables también en Vue 2.7)
- **TypeScript**: tipado completo y tipos exportados

## Inicio rápido

```bash
npm install vue-llm
```

```vue
<script setup>
import { useChat } from 'vue-llm'
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: 'sk-...',
  dangerouslyAllowBrowser: true, // only for prototyping
})

const { messages, input, handleSubmit, isLoading } = useChat({
  provider: ai,
  model: 'gpt-4o',
})
</script>

<template>
  <div v-for="msg in messages" :key="msg.id">
    <strong>{{ msg.role }}:</strong>
    <span v-for="(part, i) in msg.parts" :key="i">
      <template v-if="part.type === 'text'">{{ part.text }}</template>
    </span>
  </div>

  <form @submit.prevent="handleSubmit">
    <input v-model="input" placeholder="Ask something..." />
    <button :disabled="isLoading">Send</button>
  </form>
</template>
```

## Proveedores

### OpenAI

```ts
import { createOpenAI } from 'vue-llm/providers'

const ai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})
```

### Anthropic

```ts
import { createAnthropic } from 'vue-llm/providers'

const ai = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'claude-sonnet-4-5',
})
```

### Ollama (local)

```ts
import { createOllama } from 'vue-llm/providers'

const ai = createOllama() // localhost:11434 by default

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'llama3',
})
```

### En el navegador (WebGPU)

```ts
import { CreateMLCEngine } from '@mlc-ai/web-llm' // npm i @mlc-ai/web-llm
import { createWebLLM } from 'vue-llm/providers'

const ai = createWebLLM({
  createEngine: CreateMLCEngine,
  onProgress: ({ progress }) => console.log(`${Math.round(progress * 100)}%`),
})

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
})
```

El modelo se ejecuta en la GPU del usuario y nada sale del dispositivo. Consulta [Modelos en el navegador](https://dadashi44.github.io/vue-llm/es/guide/in-browser).

## Llamadas a herramientas

```ts
const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: [
    {
      name: 'get_weather',
      description: 'Get weather for a city',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' },
        },
        required: ['city'],
      },
    },
  ],
  onToolCall: async ({ toolName, args }) => {
    if (toolName === 'get_weather') {
      return { temperature: 22, condition: 'sunny' }
    }
  },
  maxToolRoundtrips: 3,
})
```

## Adjuntos

Pasa objetos `File`, `FileList` o `FilePart` a `sendMessage`. Los archivos se leen como data URLs y se guardan como partes `file` en el mensaje del usuario.

```vue
<script setup lang="ts">
const { messages, input, sendMessage } = useChat({ provider: ai, model: 'gpt-4o' })
const files = ref<FileList>()

async function submit() {
  await sendMessage({ text: input.value, files: files.value })
  input.value = ''
  files.value = undefined
}
</script>

<template>
  <input type="file" multiple @change="files = ($event.target as HTMLInputElement).files ?? undefined">
  <input v-model="input" @keydown.enter="submit">
</template>
```

Las URLs remotas también funcionan: `sendMessage({ files: { type: 'file', mediaType: 'image/png', url: 'https://…' } })`.

| Proveedor | Imágenes | PDF | Audio | Texto | URLs remotas |
|----------|--------|-----|-------|------|-------------|
| OpenAI | ✓ | ✓ | wav, mp3 | insertado como texto | solo imágenes |
| Anthropic | ✓ | ✓ | — | ✓ (document) | imágenes, PDF |
| Google | ✓ | ✓ | ✓ | ✓ | URIs `fileData` |
| Ollama | ✓ | — | — | insertado como texto | — |

Las combinaciones no compatibles lanzan un error descriptivo antes de enviar la petición.

## Persistencia

Pasa un adaptador `storage` y un `id` estable: el historial se restaura al iniciar y se guarda cada vez que termina una respuesta.

```ts
import { useChat, createWebStorage } from 'vue-llm'

const { messages, setMessages, isRestored } = useChat({
  id: 'support-chat',
  provider: ai,
  model: 'gpt-4o',
  storage: createWebStorage(), // localStorage, key `vue-llm:chat:support-chat`
})

setMessages([]) // clears history and removes the stored entry
```

`createWebStorage({ prefix, storage: sessionStorage })` personaliza la clave y el backend; `createMemoryStorage()` es útil para tests. Sirve cualquier objeto que implemente `ChatStorage`, síncrono o asíncrono:

```ts
const storage: ChatStorage = {
  load: id => fetch(`/api/chats/${id}`).then(r => r.json()),
  save: (id, messages) => fetch(`/api/chats/${id}`, { method: 'PUT', body: JSON.stringify(messages) }).then(() => {}),
  remove: id => fetch(`/api/chats/${id}`, { method: 'DELETE' }).then(() => {}),
}
```

Con almacenamiento asíncrono, `isRestored` es `false` hasta que `load` se resuelve. Los mensajes enviados antes se conservan: el historial guardado no los sobrescribe. Los errores de almacenamiento van a `onError`. Los adjuntos se guardan como data URLs, así que los archivos grandes pueden superar la cuota de ~5 MB de localStorage.

## Reintentos y límites de peticiones

```ts
import { wrapProvider, retryMiddleware, rateLimitMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  retryMiddleware({ maxRetries: 3, initialDelay: 1000, maxDelay: 30_000 }),
  rateLimitMiddleware({ maxRequests: 20, interval: 60_000, maxConcurrent: 2 }),
])
```

`retryMiddleware` reenvía la petición ante errores 408, 409, 429, 5xx y de red con backoff exponencial (`initialDelay * factor^n`, con jitter), respetando `Retry-After` / `retry-after-ms`. Pasa `shouldRetry(error, attempt)` para personalizarlo y `onRetry` para observarlo. Solo se reintenta la petición inicial; los errores que llegan después de empezar el stream no.

`rateLimitMiddleware` encola las peticiones en el cliente: como máximo `maxRequests` por `interval` y `maxConcurrent` streams abiertos (un hueco se libera cuando el stream termina o se cancela). Cancelar una petición en cola la rechaza de inmediato.

Los proveedores lanzan `LLMAPIError` con `status`, `provider`, `body`, `retryAfter` e `isRetryable`:

```ts
import { LLMAPIError } from 'vue-llm'

onError(error) {
  if (error instanceof LLMAPIError && error.status === 429) showToast('Slow down')
}
```

En el servidor, `createLLMHandler` puede limitar las peticiones por cliente (identificado por defecto por `x-forwarded-for` / `x-real-ip`) y responde con `429` + `Retry-After`:

```ts
createLLMHandler({
  provider,
  rateLimit: { maxRequests: 10, interval: 60_000, key: req => req.headers.get('x-user-id') ?? 'anon' },
})
```

El limitador del servidor vive en memoria por instancia: en despliegues con varias instancias, pon delante del manejador un limitador compartido (p. ej., basado en Redis).

## Prompt de sistema

```ts
const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  system: 'You are a helpful assistant that speaks like a pirate.',
})
```

`system` también acepta un ref o un getter (en `useChat`, `useCompletion` y `useObject`) y se vuelve a leer en cada petición.

## Plantillas de prompts

Los nombres de las variables se infieren a partir del string de la plantilla, así que las variables que faltan o están mal escritas son errores de tipos:

```ts
import { createPrompt, createChatPrompt, usePrompt } from 'vue-llm'

const translate = createPrompt('Translate {{ text }} to {{lang}}.', { defaults: { lang: 'English' } })

translate.render({ text: 'Hola' })          // 'Translate Hola to English.'
translate.render({ txt: 'Hola' })           // ✗ type error
translate.variables                         // ['text', 'lang']
```

Los valores que faltan también lanzan un error en tiempo de ejecución. Escapa un placeholder con una barra invertida: `\{{literal}}`.

Prompts reactivos con `usePrompt`:

```ts
const lang = ref('French')
const system = usePrompt('Always reply in {{lang}}.', () => ({ lang: lang.value }))

const chat = useChat({ provider: ai, model: 'gpt-4o', system })
```

Plantillas de varios mensajes:

```ts
const tutor = createChatPrompt([
  { role: 'system', content: 'You are a {{level}} tutor.' },
  { role: 'user', content: 'Explain {{topic}}.' },
])

tutor.render({ level: 'patient', topic: 'recursion' })      // ChatMessage[] for provider.chat()
useChat({ provider: ai, model: 'gpt-4o', initialMessages: tutor.toUIMessages({ level: 'patient', topic: 'recursion' }) })
```

## Referencia de la API

### `useChat(options)`

Devuelve una interfaz de chat reactiva.

**Opciones:**

| Opción | Tipo | Descripción |
|--------|------|-------------|
| `provider` | `LLMProvider` | Instancia del proveedor (obligatoria) |
| `model` | `string` | ID del modelo (obligatorio) |
| `system` | `MaybeRefOrGetter<string>` | Prompt de sistema |
| `tools` | `ToolDefinition[]` | Herramientas disponibles |
| `onToolCall` | `(call) => unknown` | Manejador de llamadas a herramientas |
| `onFinish` | `(msg, ctx) => void` | Se llama cuando termina la respuesta |
| `onError` | `(error) => void` | Manejador de errores |
| `maxToolRoundtrips` | `number` | Máximo de rondas de llamadas a herramientas (por defecto: 5) |
| `storage` | `ChatStorage` | Guarda y restaura los mensajes por `id` |

**Valores devueltos:**

| Propiedad | Tipo | Descripción |
|----------|------|-------------|
| `messages` | `Ref<UIMessage[]>` | Mensajes del chat |
| `status` | `Ref<ChatStatus>` | `'ready' \| 'submitted' \| 'streaming' \| 'error'` |
| `error` | `Ref<Error \| undefined>` | Último error |
| `input` | `Ref<string>` | Texto de entrada (v-model) |
| `isLoading` | `Ref<boolean>` | Si hay una petición activa |
| `sendMessage` | `(text? \| { text?, files? }) => Promise` | Envía un mensaje, opcionalmente con adjuntos |
| `stop` | `() => void` | Cancela el stream actual |
| `regenerate` | `() => Promise` | Elimina el último mensaje del asistente y lo genera de nuevo |
| `setMessages` | `(msgs) => void` | Reemplaza el historial de mensajes |
| `handleSubmit` | `(event?: Event) => void` | Manejador de envío del formulario (envía `input.value`) |
| `clearError` | `() => void` | Limpia el estado de error |
| `isRestored` | `Ref<boolean>` | `false` mientras carga el almacenamiento asíncrono |

## Módulo de Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['vue-llm/nuxt'],
  runtimeConfig: {
    vueLlm: {
      openaiApiKey: '',
      anthropicApiKey: '',
    },
  },
})
```

Los composables y las factorías de proveedores se importan automáticamente.

## Seguridad

Los proveedores lanzan un error si se usan en el navegador sin activarlo explícitamente:

```ts
// This will throw in browser:
const ai = createOpenAI({ apiKey: 'sk-...' })

// Opt-in for prototyping only:
const ai = createOpenAI({
  apiKey: 'sk-...',
  dangerouslyAllowBrowser: true,
})
```

En producción, haz de proxy de las llamadas a la API a través de tu servidor o usa el módulo de Nuxt con `runtimeConfig`.

## Formato de los mensajes

Los mensajes usan un formato basado en partes para contenido enriquecido:

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

## Licencia

MIT
