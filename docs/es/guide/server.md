---
description: 'createLLMHandler: un manejador Request/Response basado en estándares web que hace de proxy de las llamadas al LLM, ejecuta herramientas en el servidor y limita las peticiones por IP. Funciona en Nuxt, Node, Bun, Deno y runtimes edge.'
---

# Servidor y proxy

`vue-llm/server` convierte cualquier proveedor en un endpoint HTTP con streaming y le da al navegador un proveedor que se comunica con él: las API keys nunca salen del servidor.

## createLLMHandler

Devuelve un manejador `(request: Request) => Promise<Response>` basado en estándares web, así que funciona en Node (a través de tu framework), Bun, Deno, Cloudflare Workers y Nuxt/Nitro.

```ts
import { createLLMHandler } from 'vue-llm/server'
import { createAnthropic } from 'vue-llm/providers'

const handler = createLLMHandler({
  provider: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  model: 'claude-sonnet-4-5',
  system: 'You are a helpful assistant.',
  maxMessages: 50,
  rateLimit: { maxRequests: 30, interval: 60_000 },
  onRequest: body => ({ ...body, model: 'claude-sonnet-4-5' }), // pin the model
})

// Bun
Bun.serve({ port: 3000, fetch: req => new URL(req.url).pathname === '/api/chat' ? handler(req) : new Response('Not found', { status: 404 }) })
```

| Opción | Tipo | Descripción |
|--------|------|-------------|
| `provider` | `LLMProvider` | Obligatoria |
| `model` | `string` | Modelo por defecto (el cuerpo puede sobrescribirlo) |
| `system` | `string` | Prompt de sistema por defecto (el cuerpo puede sobrescribirlo) |
| `tools` | `ServerToolDefinition[]` | Herramientas que se ofrecen al modelo; las que tienen `execute` se ejecutan en el servidor |
| `maxToolRoundtrips` | `number` | Máximo de rondas de herramientas de servidor por petición (por defecto `5`) |
| `maxMessages` | `number` | Conserva solo los últimos N mensajes |
| `rateLimit` | `{ maxRequests, interval?, key? }` | Límite por cliente; responde `429` + `Retry-After` |
| `onRequest` | `(body) => body` | Valida o reescribe el cuerpo de la petición |

El cuerpo de la petición es `{ messages: ChatMessage[], model?: string, system?: string }`. Las respuestas son Server-Sent Events, un `ChatStreamChunk` por evento, y terminan con `data: [DONE]`. Los errores anteriores al streaming devuelven JSON con estado `400`, `405`, `429` o `500`.

## Herramientas de servidor {#server-tools}

Dale a una herramienta una función `execute` y el manejador la ejecuta en el servidor, devuelve el resultado al modelo y sigue haciendo streaming; el navegador nunca ve tu base de datos ni tus API keys:

```ts
const handler = createLLMHandler({
  provider,
  tools: [
    {
      name: 'get_standings',
      description: 'Current standings of a tournament',
      parameters: { type: 'object', properties: { tournament: { type: 'number' } }, required: ['tournament'] },
      async execute(args, { request }) {
        const { tournament } = args as { tournament: number }
        await assertCanRead(request, tournament)
        return db.standings(tournament)
      },
    },
  ],
})
```

El cliente recibe la llamada a la herramienta seguida de un chunk `tool-result`, así que la parte `tool-call` pasa directamente a `result` sin una ida y vuelta al cliente. Un error lanzado se convierte en `{ type: 'tool-result', error }` y también se comunica al modelo, que puede recuperarse o explicarlo.

Las herramientas sin `execute` quedan en manos del cliente: el stream termina con `finishReason: 'tool-calls'` y `useChat` ejecuta `onToolCall` como de costumbre. Puedes mezclar herramientas de servidor y de cliente en una misma petición.

## createProxyProvider

```ts
import { useChat } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'

const { messages, sendMessage } = useChat({
  provider: createProxyProvider('/api/chat'),
  model: 'claude-sonnet-4-5',
})
```

Los adjuntos, las llamadas a herramientas, los resultados de las herramientas de servidor y el razonamiento pasan por el proxy sin cambios. Es una capa fina sobre [`createSSEProvider`](./custom-backends). Las respuestas que no son 2xx se convierten en `LLMAPIError` con `provider: 'proxy'`.

## streamToSSE

Helper de más bajo nivel por si construyes la respuesta tú mismo:

```ts
import { streamToSSE } from 'vue-llm/server'

const { stream } = await provider.chat({ model, messages })
return new Response(streamToSSE(stream), { headers: { 'Content-Type': 'text/event-stream' } })
```
