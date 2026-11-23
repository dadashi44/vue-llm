---
description: 'Conecta useChat a un backend existente que hace streaming de Server-Sent Events con createSSEProvider, traduciendo tu formato de eventos a chunks de vue-llm.'
---

# Backends propios

Muchas apps ya tienen un backend que habla con el LLM: guarda sesiones, inyecta contexto de negocio y ejecuta herramientas contra tu base de datos. `createSSEProvider` conecta `useChat` a ese backend sin cambiar su protocolo.

## createSSEProvider

```ts
import { useChat } from 'vue-llm'
import { createSSEProvider } from 'vue-llm/providers'

const provider = createSSEProvider({
  url: req => `/api/ai-chat/sessions/${(req.providerOptions as { sessionId: string }).sessionId}/stream`,
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  body: req => ({ message: req.messages.at(-1)?.content }), // session backends only need the new message
  mapEvent: ({ event, json }) => {
    const d = json as any
    switch (event) {
      case 'thinking': return { type: 'reasoning-delta', text: d.text }
      case 'text_delta': return { type: 'text-delta', text: d.text }
      case 'tool_use': return [
        { type: 'tool-call-start', toolCallId: d.id, toolName: d.name },
        { type: 'tool-call-delta', toolCallId: d.id, args: JSON.stringify(d.input) },
        { type: 'tool-call-end', toolCallId: d.id },
      ]
      case 'tool_result': return { type: 'tool-result', toolCallId: d.tool_use_id, result: d.output }
      case 'final': return { type: 'message-metadata', metadata: d } // summary, chart…
      case 'error': return { type: 'error', error: new Error(d.message) }
      case 'done': return { type: 'finish', finishReason: 'stop' }
    }
  },
})

const sessionId = ref('s1')
const { messages, sendMessage } = useChat({ provider, model: 'default', body: () => ({ sessionId: sessionId.value }) })
```

| Opción | Tipo | Descripción |
|--------|------|-------------|
| `url` | `string \| (request) => string` | Endpoint; puede depender de la petición (`providerOptions` lleva el `body` de `useChat`) |
| `method` | `string` | Por defecto `POST` |
| `headers` | `HeadersInit \| () => HeadersInit \| Promise<HeadersInit>` | Estáticas o por petición (p. ej., tokens de autenticación renovados) |
| `credentials` | `RequestCredentials` | P. ej., `'include'` para autenticación con cookies |
| `body` | `(request) => unknown` | JSON de la petición. Por defecto `{ messages, model }` |
| `mapEvent` | `({ event, data, json, id }) => chunk \| chunk[] \| null` | Traduce un evento SSE; `response` da acceso a las cabeceras. Por defecto, se asume que los datos ya son un chunk de vue-llm |
| `id` / `name` | `string` | Se usa en `LLMAPIError.provider` y en los mensajes de error |

- `json` es `event.data` parseado como JSON (o `undefined`); `data: [DONE]` se ignora.
- Devuelve `null`/`undefined` para saltarte un evento, o un array para emitir varios chunks.
- Si el stream termina sin un chunk `finish`, se añade uno.
- Las respuestas que no son 2xx lanzan [`LLMAPIError`](./retries-rate-limiting#errors), así que `retryMiddleware` también funciona aquí.

## Resultados de herramientas en el servidor {#server-side-tool-results}

Cuando el backend ejecuta las herramientas por su cuenta, emite un chunk `tool-result` después de la llamada:

```ts
{ type: 'tool-result', toolCallId: 't1', result: { leader: 'Team A' } }
{ type: 'tool-result', toolCallId: 't1', error: 'Database unavailable' }
```

La parte `tool-call` correspondiente pasa a `result` (o `error`) y `useChat` **no** inicia una ida y vuelta en el cliente para ella. Muestra el progreso a partir del `state` de la parte: `pending` → (`running`) → `result` / `error`.

::: tip
`tool-call-end` llega antes que `tool-result`, así que un manejador `onToolCall` también ve las llamadas del servidor. Devuelve `undefined` para las herramientas que el cliente no gestiona: el resultado del servidor las completará.
:::

## Sesiones en el backend {#sessions-on-the-backend}

Muchos backends guardan el historial por su cuenta (por id de sesión o conversación) y solo esperan el mensaje nuevo. Cada petición lleva lo que el backend necesita para ello:

| Campo de la petición | Valor |
|---|---|
| `trigger` | `'submit'`: un mensaje nuevo del usuario. `'regenerate'`: se llamó a `regenerate()`. `'continue'`: se envían al modelo los resultados de herramientas. |
| `messageId` | En `submit`, el id del nuevo mensaje del usuario. En `regenerate`, el id del mensaje del asistente que se reemplaza, para que el backend pueda borrarlo. |

Para usar los ids de tu base de datos en el cliente, empieza la respuesta con un chunk `message-start`. Define el id del mensaje del asistente, que también llega al backend como `messageId` en `regenerate`.

```ts
const provider = createSSEProvider({
  url: req => `/api/sessions/${sessionId.value}/ask`,
  body: req => ({
    message: req.messages.at(-1)?.content, // the backend keeps the history
    regenerate: req.trigger === 'regenerate' ? req.messageId : undefined,
  }),
  mapEvent: ({ event, json, response }) => {
    const d = json as any
    switch (event) {
      case 'start': return { type: 'message-start', id: d.message_id } // or response.headers.get('X-Message-Id')
      // …
    }
  },
})

const { messages, sendMessage, regenerate } = useChat({
  provider,
  model: 'default',
  id: sessionId, // a ref: switching it loads that session
  storage: {
    load: async id => (await api.getMessages(id)).map(toUIMessage),
    save: () => {}, // the backend saves on its own
    remove: () => {},
  },
})
```

Pasar `id` como ref cambia de sesión: la respuesta en curso se detiene y se carga el historial de la nueva sesión. Consulta [Persistencia](./persistence#switching-chats).

## Metadatos del mensaje {#message-metadata}

Los datos que pertenecen a la respuesta pero no son texto, como un id en tu base de datos, fuentes, un gráfico o el coste, van en un chunk `message-metadata`:

```ts
{ type: 'message-metadata', metadata: { messageId: 42, summary: '…' } }
```

`useChat` los combina en el `metadata` del mensaje del asistente. Pueden llegar varios chunks durante el stream, y una clave posterior reemplaza a la anterior. Renderízalos como cualquier otro campo:

```vue
<ChartFromAi v-if="message.metadata?.chart" :chart="message.metadata.chart" />
```

Los metadatos también están en el mensaje que recibe `onFinish` y se guardan con la [persistencia](./persistence). Un stream de `createLLMHandler` pasa estos chunks a `createProxyProvider` sin cambios.

## Con vue-llm en el servidor {#with-vue-llm-on-the-server}

Si tu backend es JavaScript, `createLLMHandler` puede ejecutar las herramientas por ti; consulta [Herramientas de servidor](./server#server-tools). Su stream ya habla el protocolo de vue-llm, así que el cliente solo necesita `createProxyProvider`.
