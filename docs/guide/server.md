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
| `tools` | `ToolDefinition[]` | Tools offered to the model |
| `maxMessages` | `number` | Keep only the last N messages |
| `rateLimit` | `{ maxRequests, interval?, key? }` | Per-client limit, responds `429` + `Retry-After` |
| `onRequest` | `(body) => body` | Validate or rewrite the request body |

The request body is `{ messages: ChatMessage[], model?: string, system?: string }`. Responses are Server-Sent Events, one `ChatStreamChunk` per event, ending with `data: [DONE]`. Errors before streaming return JSON with status `400`, `405`, `429` or `500`.

## createProxyProvider

```ts
import { useChat } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'

const { messages, sendMessage } = useChat({
  provider: createProxyProvider('/api/chat'),
  model: 'claude-sonnet-4-5',
})
```

Attachments, tool calls and reasoning stream through the proxy unchanged. Non-2xx responses become `LLMAPIError`s with `provider: 'proxy'`.

## streamToSSE

Lower-level helper if you build the response yourself:

```ts
import { streamToSSE } from 'vue-llm/server'

const { stream } = await provider.chat({ model, messages })
return new Response(streamToSSE(stream), { headers: { 'Content-Type': 'text/event-stream' } })
```
