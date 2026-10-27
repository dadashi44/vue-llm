---
description: 'Envolva qualquer provedor de LLM com middleware para logging, headers, retentativas, rate limits e tratamento customizado de requisições e streams.'
---

# Middleware

`wrapProvider` retorna um provedor com o middleware aplicado. Os middlewares rodam na ordem do array.

```ts
import { wrapProvider, loggingMiddleware, headerMiddleware, retryMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  loggingMiddleware('chat'),
  headerMiddleware({ 'x-team': 'support' }),
  retryMiddleware(),
])
```

## Middleware nativo {#built-in-middleware}

| Middleware | Descrição |
|------------|-------------|
| `loggingMiddleware(label?)` | Faz log das requisições, finish reasons e erros |
| `headerMiddleware(headers)` | Adiciona `providerOptions.headers` |
| `retryMiddleware(options?)` | Reenvia requisições que falharam com backoff — veja [Retentativas](./retries-rate-limiting) |
| `rateLimitMiddleware(options)` | Fila de requisições no cliente — veja [Rate limiting](./retries-rate-limiting#client-side-rate-limiting) |

## Escrevendo middleware {#writing-middleware}

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

| Hook | Assinatura | Para que serve |
|------|-----------|---------|
| `beforeRequest` | `(request, provider) => request` | Reescrever a requisição |
| `wrapChat` | `(next, request) => Promise<result>` | Chamar o provedor zero ou mais vezes (retentativas, filas, cache) |
| `afterStream` | `(chunk, request) => chunk \| null` | Transformar ou descartar chunks do stream |
| `onError` | `(error, request) => Error \| void` | Substituir ou observar erros |
| `onFinish` | `(request, result) => void` | Chamado quando o stream é retornado |

O `wrapChat` se compõe como uma cebola: o primeiro middleware do array é o mais externo.
