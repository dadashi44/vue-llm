---
description: '使用 createSSEProvider 将 useChat 连接到已有的、以 Server-Sent Events 流式输出的后端，并将你的事件格式映射为 vue-llm 的 chunk。'
---

# 自定义后端

许多应用已经有一个与 LLM 通信的后端：它负责存储会话、注入业务上下文，并基于你的数据库运行工具。`createSSEProvider` 可以在不改变其协议的前提下，将 `useChat` 连接到这样的后端。

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
      case 'final': return { type: 'message-metadata', metadata: d } // summary, chart…
      case 'error': return { type: 'error', error: new Error(d.message) }
      case 'done': return { type: 'finish', finishReason: 'stop' }
    }
  },
})

const sessionId = ref('s1')
const { messages, sendMessage } = useChat({ provider, model: 'default', body: () => ({ sessionId: sessionId.value }) })
```

| 选项 | 类型 | 说明 |
|--------|------|-------------|
| `url` | `string \| (request) => string` | 端点，可以依赖于请求（`providerOptions` 携带 `useChat` 的 `body`） |
| `method` | `string` | 默认 `POST` |
| `headers` | `HeadersInit \| () => HeadersInit \| Promise<HeadersInit>` | 静态的，或按请求生成（例如获取最新的认证 token） |
| `credentials` | `RequestCredentials` | 例如使用 cookie 认证时设为 `'include'` |
| `body` | `(request) => unknown` | 请求 JSON。默认为 `{ messages, model }` |
| `mapEvent` | `({ event, data, json, id }) => chunk \| chunk[] \| null` | 转换单个 SSE 事件；可通过 `response` 读取响应头。默认：data 本身就是 vue-llm chunk |
| `id` / `name` | `string` | 用于 `LLMAPIError.provider` 和错误信息 |

- `json` 是按 JSON 解析后的 `event.data`（或 `undefined`）；`data: [DONE]` 会被忽略。
- 返回 `null`/`undefined` 可跳过某个事件，返回数组则可产出多个 chunk。
- 如果流在没有 `finish` chunk 的情况下结束，会自动补上一个。
- 非 2xx 响应会抛出 [`LLMAPIError`](./retries-rate-limiting#errors)，因此 `retryMiddleware` 在这里同样适用。

## 服务端工具结果 {#server-side-tool-results}

当后端自行执行工具时，在调用之后发出一个 `tool-result` chunk：

```ts
{ type: 'tool-result', toolCallId: 't1', result: { leader: 'Team A' } }
{ type: 'tool-result', toolCallId: 't1', error: 'Database unavailable' }
```

对应的 `tool-call` part 会变为 `result`（或 `error`），并且 `useChat` **不会** 为它发起客户端往返。可以根据 part 的 `state` 渲染进度：`pending` → (`running`) → `result` / `error`。

::: tip
`tool-call-end` 会先于 `tool-result` 到达，因此 `onToolCall` 处理函数也会看到服务端调用。对于客户端不处理的工具返回 `undefined` 即可，服务端结果会将其补全。
:::

## 后端会话 {#sessions-on-the-backend}

许多后端自己保存历史（按会话 id），只需要新消息。每个请求都会携带后端为此所需的信息：

| 请求字段 | 值 |
|---|---|
| `trigger` | `'submit'`：新的用户消息。`'regenerate'`：调用了 `regenerate()`。`'continue'`：把工具结果发回模型。 |
| `messageId` | `submit` 时为新用户消息的 id。`regenerate` 时为被替换的助手消息的 id，后端可据此删除它。 |

要在客户端使用数据库中的 id，请以 `message-start` chunk 开始回答。它会设置助手消息的 id，`regenerate` 时这个 id 也会作为 `messageId` 发给后端。

```ts
const provider = createSSEProvider({
  url: req => `/api/sessions/${sessionId.value}/ask`,
  body: req => ({
    message: req.messages.at(-1)?.content, // the backend keeps the history
    regenerate: req.trigger === 'regenerate' ? req.messageId : undefined,
  }),
  mapEvent: ({ event, json, response }) => {
    const d = json as any
    switch (event) {
      case 'start': return { type: 'message-start', id: d.message_id } // or response.headers.get('X-Message-Id')
      // …
    }
  },
})

const { messages, sendMessage, regenerate } = useChat({
  provider,
  model: 'default',
  id: sessionId, // a ref: switching it loads that session
  storage: {
    load: async id => (await api.getMessages(id)).map(toUIMessage),
    save: () => {}, // the backend saves on its own
    remove: () => {},
  },
})
```

把 `id` 作为 ref 传入即可切换会话：正在进行的回答会停止，并加载新会话的历史。参见[持久化](./persistence#switching-chats)。

## 消息元数据 {#message-metadata}

属于回答但不是文本的数据（数据库中的 id、来源、图表、费用等）通过 `message-metadata` chunk 传递：

```ts
{ type: 'message-metadata', metadata: { messageId: 42, summary: '…' } }
```

`useChat` 会将其合并到助手消息的 `metadata` 中。流中可以出现多个这样的 chunk，后到的键会覆盖先前的键。像其他字段一样渲染即可：

```vue
<ChartFromAi v-if="message.metadata?.chart" :chart="message.metadata.chart" />
```

传给 `onFinish` 的消息中同样包含这些元数据，并会随[持久化](./persistence)一起保存。`createLLMHandler` 的流会将这些 chunk 原样传给 `createProxyProvider`。

## 在服务端使用 vue-llm {#with-vue-llm-on-the-server}

如果你的后端是 JavaScript，`createLLMHandler` 可以替你执行工具，参阅 [服务端工具](./server#server-tools)。它的流已经使用 vue-llm 协议，因此客户端只需要 `createProxyProvider`。
