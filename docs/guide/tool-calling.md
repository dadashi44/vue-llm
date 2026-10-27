# Tool Calling

Declare tools with JSON Schema parameters and handle calls in `onToolCall`. The returned value is sent back to the model and the conversation continues automatically.

```ts
const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: [
    {
      name: 'get_weather',
      description: 'Get the current weather for a city',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    },
  ],
  async onToolCall({ toolName, args }) {
    if (toolName === 'get_weather') {
      const { city } = args as { city: string }
      return fetch(`/api/weather?city=${city}`).then(r => r.json())
    }
  },
  maxToolRoundtrips: 3,
})
```

## Lifecycle

Each call appears as a `tool-call` part on the assistant message:

| `state` | Meaning |
|---------|---------|
| `pending` | Arguments are streaming |
| `running` | `onToolCall` is executing |
| `result` | `result` holds the return value |
| `error` | `onToolCall` threw; `error` holds the message |

Returning `undefined` leaves the call unresolved, which is useful for human-in-the-loop flows. Resolve it later with `addToolResult`:

```ts
addToolResult({ toolCallId, result: { approved: true } })
```

`maxToolRoundtrips` (default `5`) caps how many times the model may call tools in response to one message.

## Server-side tools

Tools that need secrets or database access should run on the server. With [`createLLMHandler`](./server#server-tools) add `execute` to the tool; with your own backend emit `tool-result` chunks via [`createSSEProvider`](./custom-backends#server-side-tool-results). Either way the part's `state` becomes `result` and the client makes no extra request.
