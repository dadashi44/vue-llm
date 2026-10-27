---
description: 'Оборачивайте любой LLM-провайдер в middleware для логирования, заголовков, повторов, лимитов и собственной обработки запросов и потока.'
---

# Middleware

`wrapProvider` возвращает провайдер с применёнными middleware. Middleware выполняются в порядке следования в массиве.

```ts
import { wrapProvider, loggingMiddleware, headerMiddleware, retryMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  loggingMiddleware('chat'),
  headerMiddleware({ 'x-team': 'support' }),
  retryMiddleware(),
])
```

## Встроенные middleware {#built-in-middleware}

| Middleware | Описание |
|------------|-------------|
| `loggingMiddleware(label?)` | Логирует запросы, причины завершения и ошибки |
| `headerMiddleware(headers)` | Добавляет `providerOptions.headers` |
| `retryMiddleware(options?)` | Повторно отправляет неудачные запросы с задержкой — см. [Повторы](./retries-rate-limiting) |
| `rateLimitMiddleware(options)` | Очередь запросов на клиенте — см. [Ограничение частоты](./retries-rate-limiting#client-side-rate-limiting) |

## Свои middleware {#writing-middleware}

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

| Хук | Сигнатура | Для чего |
|------|-----------|---------|
| `beforeRequest` | `(request, provider) => request` | Переписать запрос |
| `wrapChat` | `(next, request) => Promise<result>` | Вызвать провайдер ноль или больше раз (повторы, очереди, кэширование) |
| `afterStream` | `(chunk, request) => chunk \| null` | Преобразовать или отбросить чанки потока |
| `onError` | `(error, request) => Error \| void` | Подменить или отследить ошибки |
| `onFinish` | `(request, result) => void` | Вызывается, когда поток возвращён |

`wrapChat` компонуется как луковица: первый middleware в массиве — самый внешний.
