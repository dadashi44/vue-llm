# Tool Calling

Declare tools with JSON Schema parameters. A tool with `execute` runs automatically, its return value goes back to the model, and the conversation continues.

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

`defineTool` only adds types. `execute` receives the parsed arguments and a `signal` that aborts when the chat is stopped. If it throws, the error message is sent to the model so it can recover.

## onToolCall

Tools without `execute` go to `onToolCall`, a single handler for every tool:

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

## Lifecycle

Each call appears as a `tool-call` part on the assistant message:

| `state` | Meaning |
|---------|---------|
| `streaming` | Arguments are arriving. `args` holds what has been parsed so far. |
| `pending` | Arguments are complete and the call is waiting for a result |
| `running` | `execute` / `onToolCall` is in progress |
| `result` | `result` holds the return value |
| `error` | The tool threw; `error` holds the message |

## Human in the loop

A call that gets no result (no `execute`, and `onToolCall` is missing or returns `undefined`) **pauses** the chat in `pending`. Resolve it from your UI with `addToolResult`. Once no call is left pending, the chat sends the results and continues:

```ts
await addToolResult({ toolCallId, result: { approved: true } })
await addToolResult({ toolCallId, error: 'The user declined' })
```

Set `autoSendToolResults: false` to only record the result. If the user sends a new message instead, unanswered calls are reported to the model as not answered.

To render these calls as components, see [Generative UI](./generative-ui).

`maxToolRoundtrips` (default `5`) caps how many times the model may call tools in response to one message.

## Server-side tools

Tools that need secrets or database access should run on the server. With [`createLLMHandler`](./server#server-tools) add `execute` to the tool; with your own backend emit `tool-result` chunks via [`createSSEProvider`](./custom-backends#server-side-tool-results). Either way the part's `state` becomes `result` and the client makes no extra request.
