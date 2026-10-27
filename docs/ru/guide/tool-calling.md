---
description: 'Вызов инструментов и функций LLM во Vue: defineTool с execute, onToolCall, состояния вызовов и human-in-the-loop через addToolResult.'
---

# Вызов инструментов

Объявляйте инструменты с параметрами в формате JSON Schema. Инструмент с `execute` выполняется автоматически, его результат возвращается модели, и диалог продолжается.

```ts
import { defineTool, useChat } from 'vue-llm'

const getWeather = defineTool<{ city: string }, { temp: number }>({
  name: 'get_weather',
  description: 'Get the current weather for a city',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
  execute: ({ city }, { signal }) => fetch(`/api/weather?city=${city}`, { signal }).then(r => r.json()),
})

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: [getWeather],
  maxToolRoundtrips: 3,
})
```

`defineTool` только добавляет типы. `execute` получает разобранные аргументы и `signal`, который срабатывает при остановке чата. Если `execute` выбрасывает ошибку, её текст отправляется модели, чтобы та могла исправиться.

## onToolCall {#ontoolcall}

Инструменты без `execute` попадают в `onToolCall` — единый обработчик для всех инструментов:

```ts
useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: [{ name: 'get_weather', description: '…', parameters: { /* … */ } }],
  async onToolCall({ toolName, args }) {
    if (toolName === 'get_weather') return fetchWeather(args as { city: string })
  },
})
```

## Жизненный цикл {#lifecycle}

Каждый вызов появляется как часть `tool-call` в сообщении ассистента:

| `state` | Значение |
|---------|---------|
| `streaming` | Аргументы ещё поступают. В `args` — то, что уже удалось разобрать. |
| `pending` | Аргументы получены полностью, вызов ждёт результата |
| `running` | Выполняется `execute` / `onToolCall` |
| `result` | В `result` — возвращённое значение |
| `error` | Инструмент выбросил ошибку; её текст — в `error` |

## Human in the loop {#human-in-the-loop}

Вызов, который не получил результата (нет `execute`, а `onToolCall` отсутствует или возвращает `undefined`), **ставит чат на паузу** в состоянии `pending`. Завершите его из интерфейса через `addToolResult`. Когда ожидающих вызовов не останется, чат отправит результаты и продолжит работу:

```ts
await addToolResult({ toolCallId, result: { approved: true } })
await addToolResult({ toolCallId, error: 'The user declined' })
```

Задайте `autoSendToolResults: false`, чтобы только записывать результат. Если вместо ответа пользователь отправит новое сообщение, модель получит неотвеченные вызовы с пометкой, что ответа не было.

Как рендерить такие вызовы компонентами, см. в разделе [Generative UI](./generative-ui).

`maxToolRoundtrips` (по умолчанию `5`) ограничивает, сколько раз модель может вызывать инструменты в ответ на одно сообщение.

## Инструменты на сервере {#server-side-tools}

Инструменты, которым нужны секреты или доступ к базе данных, должны работать на сервере. С [`createLLMHandler`](./server#server-tools) добавьте инструменту `execute`; со своим бэкендом отправляйте чанки `tool-result` через [`createSSEProvider`](./custom-backends#server-side-tool-results). В обоих случаях `state` части становится `result`, и клиент не делает лишних запросов.
