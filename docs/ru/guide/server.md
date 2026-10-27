---
description: 'createLLMHandler: обработчик Request/Response на веб-стандартах, который проксирует вызовы LLM, выполняет инструменты на сервере и ограничивает частоту запросов по IP. Работает в Nuxt, Node, Bun, Deno и edge-окружениях.'
---

# Сервер и прокси

`vue-llm/server` превращает любой провайдер в стриминговый HTTP-эндпоинт и даёт браузеру провайдер, который с ним общается, — API-ключи никогда не покидают сервер.

## createLLMHandler {#createllmhandler}

Возвращает обработчик `(request: Request) => Promise<Response>` на веб-стандартах, поэтому он работает в Node (через ваш фреймворк), Bun, Deno, Cloudflare Workers и Nuxt/Nitro.

```ts
import { createLLMHandler } from 'vue-llm/server'
import { createAnthropic } from 'vue-llm/providers'

const handler = createLLMHandler({
  provider: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  model: 'claude-sonnet-4-5',
  system: 'You are a helpful assistant.',
  maxMessages: 50,
  rateLimit: { maxRequests: 30, interval: 60_000 },
  onRequest: body => ({ ...body, model: 'claude-sonnet-4-5' }), // фиксируем модель
})

// Bun
Bun.serve({ port: 3000, fetch: req => new URL(req.url).pathname === '/api/chat' ? handler(req) : new Response('Not found', { status: 404 }) })
```

| Опция | Тип | Описание |
|--------|------|-------------|
| `provider` | `LLMProvider` | Обязательна |
| `model` | `string` | Модель по умолчанию (тело запроса может её переопределить) |
| `system` | `string` | Системный промпт по умолчанию (тело запроса может его переопределить) |
| `tools` | `ServerToolDefinition[]` | Инструменты, доступные модели; инструменты с `execute` выполняются на сервере |
| `maxToolRoundtrips` | `number` | Максимум раундов серверных инструментов на запрос (по умолчанию `5`) |
| `maxMessages` | `number` | Оставлять только последние N сообщений |
| `rateLimit` | `{ maxRequests, interval?, key? }` | Лимит на клиента, отвечает `429` + `Retry-After` |
| `onRequest` | `(body) => body` | Проверить или переписать тело запроса |

Тело запроса — `{ messages: ChatMessage[], model?: string, system?: string }`. Ответ приходит как Server-Sent Events, по одному `ChatStreamChunk` на событие, и завершается `data: [DONE]`. Ошибки до начала стриминга возвращаются как JSON со статусом `400`, `405`, `429` или `500`.

## Серверные инструменты {#server-tools}

Добавьте инструменту функцию `execute` — и обработчик выполнит её на сервере, вернёт результат модели и продолжит стриминг. Браузер никогда не увидит вашу базу данных или API-ключи:

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

Клиент получает вызов инструмента, а за ним чанк `tool-result`, поэтому часть `tool-call` сразу переходит в `result` без лишнего обращения клиента. Выброшенная ошибка превращается в `{ type: 'tool-result', error }` и тоже передаётся модели, которая может исправиться или объяснить, что произошло.

Инструменты без `execute` остаются клиенту: поток завершается с `finishReason: 'tool-calls'`, и `useChat` как обычно вызывает `onToolCall`. Серверные и клиентские инструменты можно сочетать в одном запросе.

## createProxyProvider {#createproxyprovider}

```ts
import { useChat } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'

const { messages, sendMessage } = useChat({
  provider: createProxyProvider('/api/chat'),
  model: 'claude-sonnet-4-5',
})
```

Вложения, вызовы инструментов, результаты серверных инструментов и рассуждения проходят через прокси без изменений. Это тонкая обёртка над [`createSSEProvider`](./custom-backends). Ответы со статусом не из 2xx становятся `LLMAPIError` с `provider: 'proxy'`.

## streamToSSE {#streamtosse}

Низкоуровневый хелпер, если вы формируете ответ сами:

```ts
import { streamToSSE } from 'vue-llm/server'

const { stream } = await provider.chat({ model, messages })
return new Response(streamToSSE(stream), { headers: { 'Content-Type': 'text/event-stream' } })
```
