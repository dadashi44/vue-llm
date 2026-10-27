# Server & Proxy

`vue-llm/server` turns any provider into a streaming HTTP endpoint and gives the browser a provider that talks to it — API keys never leave the server.

## createLLMHandler

Returns a Web-standard `(request: Request) => Promise<Response>` handler, so it runs on Node (via your framework), Bun, Deno, Cloudflare Workers and Nuxt/Nitro.

```ts
import { createLLMHandler } from 'vue-llm/server'
import { createAnthropic } from 'vue-llm/providers'

const handler = createLLMHandler({
  provider: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  model: 'claude-sonnet-4-5',
  system: 'You are a helpful assistant.',
  maxMessages: 50,
  rateLimit: { maxRequests: 30, interval: 60_000 },
  onRequest: body => ({ ...body, model: 'claude-sonnet-4-5' }), // pin the model
})

// Bun
Bun.serve({ port: 3000, fetch: req => new URL(req.url).pathname === '/api/chat' ? handler(req) : new Response('Not found', { status: 404 }) })
```

| Option | Type | Description |
|--------|------|-------------|
| `provider` | `LLMProvider` | Required |
| `model` | `string` | Default model (the body may override it) |
| `system` | `string` | Default system prompt (the body may override it) |
| `tools` | `ServerToolDefinition[]` | Tools offered to the model; those with `execute` run on the server |
| `maxToolRoundtrips` | `number` | Max server tool rounds per request (default `5`) |
| `maxMessages` | `number` | Keep only the last N messages |
| `rateLimit` | `{ maxRequests, interval?, key? }` | Per-client limit, responds `429` + `Retry-After` |
| `onRequest` | `(body) => body` | Validate or rewrite the request body |

The request body is `{ messages: ChatMessage[], model?: string, system?: string }`. Responses are Server-Sent Events, one `ChatStreamChunk` per event, ending with `data: [DONE]`. Errors before streaming return JSON with status `400`, `405`, `429` or `500`.

## Server tools

Give a tool an `execute` function and the handler runs it on the server, feeds the result back to the model and keeps streaming — the browser never sees your database or API keys:

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

The client receives the tool call followed by a `tool-result` chunk, so the `tool-call` part goes straight to `result` without a client roundtrip. A thrown error becomes `{ type: 'tool-result', error }` and is also reported to the model, which can recover or explain.

Tools without `execute` are left to the client: the stream ends with `finishReason: 'tool-calls'` and `useChat` runs `onToolCall` as usual. Server and client tools can be mixed in one request.

## createProxyProvider

```ts
import { useChat } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'

const { messages, sendMessage } = useChat({
  provider: createProxyProvider('/api/chat'),
  model: 'claude-sonnet-4-5',
})
```

Attachments, tool calls, server tool results and reasoning stream through the proxy unchanged. It is a thin wrapper around [`createSSEProvider`](./custom-backends). Non-2xx responses become `LLMAPIError`s with `provider: 'proxy'`.

## streamToSSE

Lower-level helper if you build the response yourself:

```ts
import { streamToSSE } from 'vue-llm/server'

const { stream } = await provider.chat({ model, messages })
return new Response(streamToSSE(stream), { headers: { 'Content-Type': 'text/event-stream' } })
```
