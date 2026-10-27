---
description: 'Повторяйте неудачные запросы к LLM с экспоненциальной задержкой и учётом Retry-After и ограничивайте частоту запросов на клиенте и на сервере.'
---

# Повторы и лимиты

## Ошибки {#errors}

На ответы со статусом не из диапазона 2xx провайдеры выбрасывают `LLMAPIError`:

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

| Свойство | Описание |
|----------|-------------|
| `status` | HTTP-статус |
| `provider` | `'openai'`, `'anthropic'`, `'google'`, `'ollama'` или `'proxy'` |
| `body` | Тело ответа как есть |
| `retryAfter` | Миллисекунды из `retry-after-ms` / `Retry-After` |
| `isRetryable` | `true` для 408, 409, 429 и 5xx |

## Повторы {#retries}

```ts
import { wrapProvider, retryMiddleware } from 'vue-llm'

const ai = wrapProvider(createOpenAI({ apiKey }), [
  retryMiddleware({
    maxRetries: 3,       // по умолчанию 3
    initialDelay: 1000,  // по умолчанию 1000 мс
    factor: 2,           // по умолчанию 2
    maxDelay: 30_000,    // по умолчанию 30 с
    jitter: true,        // по умолчанию true — случайные 50–100% от задержки
    onRetry: ({ attempt, delay, error }) => console.warn(`retry #${attempt} in ${delay}ms`, error),
  }),
])
```

- Повторяет `LLMAPIError` с `isRetryable` и сетевые ошибки (`TypeError` из `fetch`).
- Ждёт `initialDelay * factor^(attempt-1)` или `Retry-After` от сервера, но не дольше `maxDelay`.
- Отмена запроса (например, через `stop()`) сразу прерывает ожидание.
- Повторяется только исходный запрос — ошибки после начала стриминга не повторяются.
- Политику можно переопределить через `shouldRetry(error, attempt)`.

## Ограничение частоты на клиенте {#client-side-rate-limiting}

```ts
import { rateLimitMiddleware } from 'vue-llm'

const ai = wrapProvider(provider, [
  retryMiddleware(),
  rateLimitMiddleware({ maxRequests: 20, interval: 60_000, maxConcurrent: 2 }),
])
```

Запросы сверх лимита ждут в очереди. Слот параллельности освобождается, когда поток ответа завершается или отменяется. Отмена запроса, стоящего в очереди, отклоняет его без вызова провайдера.

Ставьте `retryMiddleware` перед `rateLimitMiddleware`, чтобы каждый повтор тоже проходил через лимитер.

## Ограничение частоты на сервере {#server-side-rate-limiting}

```ts
import { createLLMHandler } from 'vue-llm/server'

export const handler = createLLMHandler({
  provider,
  rateLimit: {
    maxRequests: 10,
    interval: 60_000,
    key: req => req.headers.get('x-user-id') ?? 'anonymous', // по умолчанию: x-forwarded-for / x-real-ip
  },
})
```

При превышении лимита обработчик отвечает `429` с заголовком `Retry-After`. `createProxyProvider` превращает такой ответ в `LLMAPIError`, поэтому `retryMiddleware` на клиенте автоматически подождёт и повторит запрос.

::: info
Серверный лимитер хранит счётчики в памяти каждого инстанса. Если инстансов несколько, поставьте перед обработчиком общий лимитер (например, на Redis).
:::
