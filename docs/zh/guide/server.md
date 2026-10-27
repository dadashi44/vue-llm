---
description: 'createLLMHandler：基于 Web 标准 Request/Response 的处理器，可代理 LLM 调用、运行服务端工具并按 IP 限流。适用于 Nuxt、Node、Bun、Deno 和边缘运行时。'
---

# 服务端与代理

`vue-llm/server` 能将任意提供方变成一个流式 HTTP 端点，并为浏览器提供一个与之通信的提供方，API key 永远不会离开服务器。

## createLLMHandler

返回一个符合 Web 标准的 `(request: Request) => Promise<Response>` 处理器，因此可以运行在 Node（通过你的框架）、Bun、Deno、Cloudflare Workers 和 Nuxt/Nitro 上。

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

| 选项 | 类型 | 说明 |
|--------|------|-------------|
| `provider` | `LLMProvider` | 必填 |
| `model` | `string` | 默认模型（请求体可以覆盖） |
| `system` | `string` | 默认系统提示词（请求体可以覆盖） |
| `tools` | `ServerToolDefinition[]` | 提供给模型的工具；带有 `execute` 的工具在服务端运行 |
| `maxToolRoundtrips` | `number` | 每个请求中服务端工具的最大轮数（默认 `5`） |
| `maxMessages` | `number` | 只保留最后 N 条消息 |
| `rateLimit` | `{ maxRequests, interval?, key? }` | 按客户端限流，超限时返回 `429` + `Retry-After` |
| `onRequest` | `(body) => body` | 校验或改写请求体 |

请求体为 `{ messages: ChatMessage[], model?: string, system?: string }`。响应为 Server-Sent Events，每个事件包含一个 `ChatStreamChunk`，并以 `data: [DONE]` 结束。流开始之前发生的错误会返回 JSON，状态码为 `400`、`405`、`429` 或 `500`。

## 服务端工具 {#server-tools}

为工具提供 `execute` 函数后，处理器会在服务端运行它，将结果回传给模型并继续流式输出，浏览器永远看不到你的数据库或 API key：

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

客户端会先收到工具调用，然后收到一个 `tool-result` chunk，因此 `tool-call` part 会直接变为 `result`，无需客户端往返。抛出的错误会变成 `{ type: 'tool-result', error }`，同时也会报告给模型，模型可以据此恢复或作出解释。

没有 `execute` 的工具留给客户端处理：流会以 `finishReason: 'tool-calls'` 结束，`useChat` 会像往常一样运行 `onToolCall`。服务端工具和客户端工具可以在同一个请求中混合使用。

## createProxyProvider

```ts
import { useChat } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'

const { messages, sendMessage } = useChat({
  provider: createProxyProvider('/api/chat'),
  model: 'claude-sonnet-4-5',
})
```

附件、工具调用、服务端工具结果和推理过程都会原样通过代理流式传输。它是 [`createSSEProvider`](./custom-backends) 的一层薄封装。非 2xx 响应会变成 `provider: 'proxy'` 的 `LLMAPIError`。

## streamToSSE

如果你要自己构建响应，可以使用这个更底层的辅助函数：

```ts
import { streamToSSE } from 'vue-llm/server'

const { stream } = await provider.chat({ model, messages })
return new Response(streamToSSE(stream), { headers: { 'Content-Type': 'text/event-stream' } })
```
