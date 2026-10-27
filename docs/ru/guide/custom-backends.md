---
description: 'Подключите useChat к существующему бэкенду, который стримит Server-Sent Events, через createSSEProvider и преобразуйте формат ваших событий в чанки vue-llm.'
---

# Свой бэкенд

Во многих приложениях уже есть бэкенд, который общается с LLM: хранит сессии, добавляет бизнес-контекст и выполняет инструменты над вашей базой данных. `createSSEProvider` подключает `useChat` к такому бэкенду, не меняя его протокол.

## createSSEProvider {#createsseprovider}

```ts
import { useChat } from 'vue-llm'
import { createSSEProvider } from 'vue-llm/providers'

const provider = createSSEProvider({
  url: req => `/api/ai-chat/sessions/${(req.providerOptions as { sessionId: string }).sessionId}/stream`,
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  body: req => ({ message: req.messages.at(-1)?.content }), // бэкендам с сессиями нужно только новое сообщение
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
      case 'error': return { type: 'error', error: new Error(d.message) }
      case 'done': return { type: 'finish', finishReason: 'stop' }
    }
  },
})

const sessionId = ref('s1')
const { messages, sendMessage } = useChat({ provider, model: 'default', body: () => ({ sessionId: sessionId.value }) })
```

| Опция | Тип | Описание |
|--------|------|-------------|
| `url` | `string \| (request) => string` | Эндпоинт, может зависеть от запроса (в `providerOptions` лежит `body` из `useChat`) |
| `method` | `string` | По умолчанию `POST` |
| `headers` | `HeadersInit \| () => HeadersInit \| Promise<HeadersInit>` | Статические или вычисляемые на каждый запрос (например, свежие токены авторизации) |
| `credentials` | `RequestCredentials` | Например, `'include'` для авторизации через cookie |
| `body` | `(request) => unknown` | JSON запроса. По умолчанию `{ messages, model }` |
| `mapEvent` | `({ event, data, json, id }) => chunk \| chunk[] \| null` | Преобразует одно SSE-событие. По умолчанию считается, что данные уже являются чанком vue-llm |
| `id` / `name` | `string` | Используются в `LLMAPIError.provider` и в текстах ошибок |

- `json` — это `event.data`, разобранный как JSON (или `undefined`); `data: [DONE]` игнорируется.
- Верните `null`/`undefined`, чтобы пропустить событие, или массив, чтобы отдать несколько чанков.
- Если поток закончился без чанка `finish`, он добавляется автоматически.
- На ответы со статусом не из 2xx выбрасывается [`LLMAPIError`](./retries-rate-limiting#errors), так что `retryMiddleware` работает и здесь.

## Результаты инструментов с сервера {#server-side-tool-results}

Если бэкенд сам выполняет инструменты, отправляйте чанк `tool-result` после вызова:

```ts
{ type: 'tool-result', toolCallId: 't1', result: { leader: 'Team A' } }
{ type: 'tool-result', toolCallId: 't1', error: 'Database unavailable' }
```

Соответствующая часть `tool-call` переходит в `result` (или `error`), и `useChat` **не** запускает для неё раунд на клиенте. Показывайте прогресс по `state` части: `pending` → (`running`) → `result` / `error`.

::: tip
`tool-call-end` приходит раньше `tool-result`, поэтому обработчик `onToolCall` тоже видит серверные вызовы. Для инструментов, которые клиент не обрабатывает, возвращайте `undefined` — их заполнит результат с сервера.
:::

## С vue-llm на сервере {#with-vue-llm-on-the-server}

Если ваш бэкенд на JavaScript, `createLLMHandler` может выполнять инструменты за вас — см. [Серверные инструменты](./server#server-tools). Его поток уже говорит на протоколе vue-llm, поэтому на клиенте достаточно `createProxyProvider`.
