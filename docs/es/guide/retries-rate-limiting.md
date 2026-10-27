---
description: 'Reintenta las peticiones fallidas al LLM con backoff exponencial y Retry-After, y limita las peticiones en el cliente y en el servidor.'
---

# Reintentos y límites

## Errores {#errors}

Los proveedores lanzan `LLMAPIError` para las respuestas que no son 2xx:

```ts
import { LLMAPIError } from 'vue-llm'

useChat({
  provider: ai,
  model: 'gpt-4o',
  onError(error) {
    if (error instanceof LLMAPIError && error.status === 429) {
      toast(`Rate limited, retry in ${error.retryAfter ?? '?'} ms`)
    }
  },
})
```

| Propiedad | Descripción |
|----------|-------------|
| `status` | Código de estado HTTP |
| `provider` | `'openai'`, `'anthropic'`, `'google'`, `'ollama'` o `'proxy'` |
| `body` | Cuerpo de la respuesta sin procesar |
| `retryAfter` | Milisegundos de `retry-after-ms` / `Retry-After` |
| `isRetryable` | `true` para 408, 409, 429 y 5xx |

## Reintentos {#retries}

```ts
import { wrapProvider, retryMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  retryMiddleware({
    maxRetries: 3,       // default 3
    initialDelay: 1000,  // default 1000 ms
    factor: 2,           // default 2
    maxDelay: 30_000,    // default 30 s
    jitter: true,        // default true — random 50–100% of the delay
    onRetry: ({ attempt, delay, error }) => console.warn(`retry #${attempt} in ${delay}ms`, error),
  }),
])
```

- Reintenta los `LLMAPIError` con `isRetryable` y los errores de red (`TypeError` de `fetch`).
- Espera `initialDelay * factor^(attempt-1)`, o el `Retry-After` del servidor, con un máximo de `maxDelay`.
- Cancelar la petición (p. ej., con `stop()`) interrumpe la espera de inmediato.
- Solo se reintenta la petición inicial; los errores que llegan después de empezar el stream no.
- Sobrescribe la política con `shouldRetry(error, attempt)`.

## Límites en el cliente {#client-side-rate-limiting}

```ts
import { rateLimitMiddleware } from 'vue-llm'

const ai = wrapProvider(provider, [
  retryMiddleware(),
  rateLimitMiddleware({ maxRequests: 20, interval: 60_000, maxConcurrent: 2 }),
])
```

Las peticiones que superan el límite esperan en una cola. Un hueco de concurrencia se libera cuando el stream de la respuesta termina o se cancela. Cancelar una petición en cola la rechaza sin llamar al proveedor.

Pon `retryMiddleware` antes de `rateLimitMiddleware` para que cada reintento también pase por el limitador.

## Límites en el servidor {#server-side-rate-limiting}

```ts
import { createLLMHandler } from 'vue-llm/server'

export const handler = createLLMHandler({
  provider,
  rateLimit: {
    maxRequests: 10,
    interval: 60_000,
    key: req => req.headers.get('x-user-id') ?? 'anonymous', // default: x-forwarded-for / x-real-ip
  },
})
```

Al superar el límite, el manejador responde `429` con una cabecera `Retry-After`. `createProxyProvider` lo convierte en un `LLMAPIError`, así que un `retryMiddleware` en el cliente espera y reintenta automáticamente.

::: info
El limitador del servidor guarda los contadores en memoria por instancia. Si tienes varias instancias, pon delante del manejador un limitador compartido (p. ej., basado en Redis).
:::
