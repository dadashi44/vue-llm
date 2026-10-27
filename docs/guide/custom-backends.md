# Custom Backends

Many apps already have a backend that talks to the LLM: it stores sessions, injects business context and runs tools against your database. `createSSEProvider` connects `useChat` to such a backend without changing its protocol.

## createSSEProvider

```ts
import { useChat } from 'vue-llm'
import { createSSEProvider } from 'vue-llm/providers'

const provider = createSSEProvider({
  url: req => `/api/ai-chat/sessions/${(req.providerOptions as { sessionId: string }).sessionId}/stream`,
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  body: req => ({ message: req.messages.at(-1)?.content }), // session backends only need the new message
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

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string \| (request) => string` | Endpoint, may depend on the request (`providerOptions` carries `useChat`'s `body`) |
| `method` | `string` | Default `POST` |
| `headers` | `HeadersInit \| () => HeadersInit \| Promise<HeadersInit>` | Static or per-request (e.g. fresh auth tokens) |
| `credentials` | `RequestCredentials` | e.g. `'include'` for cookie auth |
| `body` | `(request) => unknown` | Request JSON. Default `{ messages, model }` |
| `mapEvent` | `({ event, data, json, id }) => chunk \| chunk[] \| null` | Translate one SSE event. Default: the data already is a vue-llm chunk |
| `id` / `name` | `string` | Used in `LLMAPIError.provider` and error messages |

- `json` is `event.data` parsed as JSON (or `undefined`); `data: [DONE]` is ignored.
- Return `null`/`undefined` to skip an event, or an array to emit several chunks.
- If the stream ends without a `finish` chunk, one is added.
- Non-2xx responses throw [`LLMAPIError`](./retries-rate-limiting#errors), so `retryMiddleware` works here too.

## Server-side tool results

When the backend executes tools itself, emit a `tool-result` chunk after the call:

```ts
{ type: 'tool-result', toolCallId: 't1', result: { leader: 'Team A' } }
{ type: 'tool-result', toolCallId: 't1', error: 'Database unavailable' }
```

The matching `tool-call` part moves to `result` (or `error`), and `useChat` does **not** start a client-side roundtrip for it. Render progress from the part's `state`: `pending` → (`running`) → `result` / `error`.

::: tip
`tool-call-end` arrives before `tool-result`, so an `onToolCall` handler also sees server-side calls. Return `undefined` for tools the client doesn't handle — the server result will fill them in.
:::

## With vue-llm on the server

If your backend is JavaScript, `createLLMHandler` can execute tools for you — see [Server tools](./server#server-tools). Its stream already speaks the vue-llm protocol, so the client only needs `createProxyProvider`.
