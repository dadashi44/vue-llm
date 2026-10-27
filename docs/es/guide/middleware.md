---
description: 'Envuelve cualquier proveedor de LLM con middleware para logs, cabeceras, reintentos, límites de peticiones y manejo personalizado de peticiones o del stream.'
---

# Middleware

`wrapProvider` devuelve un proveedor con el middleware aplicado. El middleware se ejecuta en el orden del array.

```ts
import { wrapProvider, loggingMiddleware, headerMiddleware, retryMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  loggingMiddleware('chat'),
  headerMiddleware({ 'x-team': 'support' }),
  retryMiddleware(),
])
```

## Middleware incluido {#built-in-middleware}

| Middleware | Descripción |
|------------|-------------|
| `loggingMiddleware(label?)` | Registra peticiones, motivos de finalización y errores |
| `headerMiddleware(headers)` | Añade `providerOptions.headers` |
| `retryMiddleware(options?)` | Reenvía las peticiones fallidas con backoff; consulta [Reintentos](./retries-rate-limiting) |
| `rateLimitMiddleware(options)` | Cola de peticiones en el cliente; consulta [Límites de peticiones](./retries-rate-limiting#client-side-rate-limiting) |

## Escribir middleware {#writing-middleware}

```ts
import type { Middleware } from 'vue-llm'

const redact: Middleware = {
  beforeRequest(request) {
    return {
      ...request,
      messages: request.messages.map(m =>
        typeof m.content === 'string' ? { ...m, content: m.content.replace(/\d{16}/g, '[card]') } : m),
    }
  },
}
```

| Hook | Firma | Para qué sirve |
|------|-----------|---------|
| `beforeRequest` | `(request, provider) => request` | Reescribir la petición |
| `wrapChat` | `(next, request) => Promise<result>` | Llamar al proveedor cero o más veces (reintentos, colas, caché) |
| `afterStream` | `(chunk, request) => chunk \| null` | Transformar o descartar chunks del stream |
| `onError` | `(error, request) => Error \| void` | Reemplazar u observar errores |
| `onFinish` | `(request, result) => void` | Se llama una vez devuelto el stream |

`wrapChat` se compone como una cebolla: el primer middleware del array es la capa más externa.
