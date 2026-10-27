---
description: 'Repita requisições de LLM que falharam com backoff exponencial e Retry-After, e aplique rate limiting no cliente e no servidor.'
---

# Retentativas e limites

## Erros {#errors}

Os provedores lançam `LLMAPIError` para respostas fora da faixa 2xx:

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

| Propriedade | Descrição |
|----------|-------------|
| `status` | Status HTTP |
| `provider` | `'openai'`, `'anthropic'`, `'google'`, `'ollama'` ou `'proxy'` |
| `body` | Corpo bruto da resposta |
| `retryAfter` | Milissegundos vindos de `retry-after-ms` / `Retry-After` |
| `isRetryable` | `true` para 408, 409, 429 e 5xx |

## Retentativas {#retries}

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

- Repete `LLMAPIError`s com `isRetryable` e erros de rede (`TypeError` do `fetch`).
- Espera `initialDelay * factor^(attempt-1)`, ou o `Retry-After` do servidor, limitado a `maxDelay`.
- Abortar a requisição (por exemplo, com `stop()`) cancela a espera na hora.
- Só a requisição inicial é repetida — erros depois que o stream começou não são.
- Sobrescreva a política com `shouldRetry(error, attempt)`.

## Rate limiting no cliente {#client-side-rate-limiting}

```ts
import { rateLimitMiddleware } from 'vue-llm'

const ai = wrapProvider(provider, [
  retryMiddleware(),
  rateLimitMiddleware({ maxRequests: 20, interval: 60_000, maxConcurrent: 2 }),
])
```

Requisições acima do limite esperam em uma fila. Um slot de concorrência é liberado quando o stream da resposta termina ou é cancelado. Abortar uma requisição na fila a rejeita sem chamar o provedor.

Coloque o `retryMiddleware` antes do `rateLimitMiddleware` para que cada retentativa também passe pelo limitador.

## Rate limiting no servidor {#server-side-rate-limiting}

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

Acima do limite, o handler responde `429` com um header `Retry-After`. O `createProxyProvider` transforma isso em um `LLMAPIError`, então um `retryMiddleware` no cliente espera e tenta de novo automaticamente.

::: info
O limitador do servidor guarda os contadores em memória, por instância. Com várias instâncias, coloque um limitador compartilhado (por exemplo, baseado em Redis) na frente do handler.
:::
