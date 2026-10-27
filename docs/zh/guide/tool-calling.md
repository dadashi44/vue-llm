---
description: '在 Vue 中实现 LLM 工具调用与函数调用：带 execute 的 defineTool、onToolCall、工具调用状态，以及通过 addToolResult 实现人工介入。'
---

# 工具调用

使用 JSON Schema 参数声明工具。带有 `execute` 的工具会自动运行，其返回值会被发回给模型，对话随之继续。

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

`defineTool` 只负责添加类型。`execute` 会接收解析后的参数，以及一个在聊天停止时中止的 `signal`。如果它抛出错误，错误信息会被发送给模型，以便模型自行恢复。

## onToolCall

没有 `execute` 的工具会交给 `onToolCall` 处理，它是所有工具共用的单一处理函数：

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

## 生命周期 {#lifecycle}

每次调用都会作为一个 `tool-call` part 出现在助手消息中：

| `state` | 含义 |
|---------|---------|
| `streaming` | 参数正在传输中。`args` 包含目前已解析的部分。 |
| `pending` | 参数已完整，调用正在等待结果 |
| `running` | `execute` / `onToolCall` 正在执行 |
| `result` | `result` 包含返回值 |
| `error` | 工具抛出了错误；`error` 包含错误信息 |

## 人工介入 {#human-in-the-loop}

没有得到结果的调用（没有 `execute`，且未提供 `onToolCall` 或其返回 `undefined`）会让聊天在 `pending` 状态下 **暂停**。在你的 UI 中通过 `addToolResult` 来完成它。当不再有处于等待状态的调用时，聊天会发送结果并继续：

```ts
await addToolResult({ toolCallId, result: { approved: true } })
await addToolResult({ toolCallId, error: 'The user declined' })
```

设置 `autoSendToolResults: false` 可以只记录结果而不自动发送。如果用户改为发送一条新消息，未回答的调用会以“未回答”的形式报告给模型。

如需将这些调用渲染为组件，请参阅 [生成式 UI](./generative-ui)。

`maxToolRoundtrips`（默认 `5`）限制了模型在响应一条消息时最多可以调用工具的次数。

## 服务端工具 {#server-side-tools}

需要密钥或数据库访问权限的工具应在服务端运行。使用 [`createLLMHandler`](./server#server-tools) 时，为工具添加 `execute` 即可；使用你自己的后端时，通过 [`createSSEProvider`](./custom-backends#server-side-tool-results) 发出 `tool-result` chunk。无论哪种方式，part 的 `state` 都会变为 `result`，客户端也不会发起额外请求。
