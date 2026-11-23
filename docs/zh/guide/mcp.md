---
description: '在 Vue 中使用 MCP（Model Context Protocol）服务器：通过 mcpTools 将任意 MCP 服务器的工具转换为 useChat 和 createLLMHandler 可用的工具。'
---

# MCP

[MCP](https://modelcontextprotocol.io)（Model Context Protocol）是一种为模型提供工具的标准方式：搜索、文件、GitHub、数据库以及[数百种其他工具](https://github.com/modelcontextprotocol/servers)。`vue-llm/mcp` 中的 `mcpTools` 接收一个已连接的 MCP 客户端，将其服务器上的工具转换为普通的 vue-llm 工具，模型便可以在 `useChat` 和 `createLLMHandler` 中调用它们。

## 安装 {#setup}

vue-llm 使用官方 SDK 中的客户端，但不会将其打包进来。请与 vue-llm 一起安装：

```bash
npm i @modelcontextprotocol/sdk
```

## 在服务端 {#on-the-server}

当 MCP 服务器需要 API 密钥，或者在本地运行（stdio）时，应在服务端使用 MCP。handler 会自行调用工具，并将结果流式传输到浏览器：

```ts
// server/api/chat.post.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createOpenAI } from 'vue-llm/providers'
import { createLLMHandler } from 'vue-llm/server'
import { mcpTools } from 'vue-llm/mcp'

const client = new Client({ name: 'my-app', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` } },
}))

const handler = createLLMHandler({
  provider: createOpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
  model: 'gpt-4o',
  tools: await mcpTools(client),
})

export default defineEventHandler(event => handler(toWebRequest(event)))
```

对于本地 MCP 服务器，请改用 stdio 连接：

```ts
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

await client.connect(new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', './docs'],
}))
```

客户端无需任何改动：搭配 [`createProxyProvider`](./server) 的 `useChat` 会将每次 MCP 调用显示为带有结果的 `tool-call` part，[`MessageParts`](./components#messageparts) 和 [DevTools](./devtools) 也会像对待其他工具一样展示它。

## 在浏览器中 {#in-the-browser}

不需要任何密钥的公共 MCP 服务器可以直接在 `useChat` 中使用。服务器需要通过 CORS 允许你的源（origin），并暴露 `Mcp-Session-Id` 响应头。

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { useChat } from 'vue-llm'
import { mcpTools } from 'vue-llm/mcp'

const client = new Client({ name: 'my-app', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp')))

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: await mcpTools(client),
})
```

与任何[带 `execute` 的工具](./tool-calling)一样，`useChat` 会执行调用、将结果发送给模型并继续对话。停止聊天会中止正在进行的 MCP 调用。

## 选项 {#options}

```ts
await mcpTools(client, {
  include: ['search', 'fetch'], // only these tools
  exclude: ['delete_file'],     // or everything except these
  prefix: 'github',             // github_search, github_fetch…
})
```

| 选项 | 说明 |
|--------|-------------|
| `include` | 只包含这些工具（按其在 MCP 服务器上的名称） |
| `exclude` | 排除这些工具 |
| `prefix` | 以 `prefix_name` 的形式加在每个名称前。组合多个服务器的工具时使用。 |
| `signal` | 取消工具列表的获取 |

多个服务器的工具可以组合到一个列表中：

```ts
tools: [
  ...await mcpTools(github, { prefix: 'github' }),
  ...await mcpTools(docs, { prefix: 'docs' }),
  getWeather,
]
```

## 结果 {#results}

- 如果工具返回 `structuredContent`，模型会收到该对象。
- 如果只返回文本，模型会收到文本。
- 其他内容（图片、资源）会以 MCP content 数组的形式原样传递。
- 如果工具报告错误（`isError`），调用会以 `error` 状态结束并附带工具的错误信息，模型可以据此恢复。

提供商不接受的工具名称字符（字母、数字、`_` 和 `-` 以外的任何字符）会被替换为 `_`。调用 MCP 服务器时始终使用原始名称。

## 安全 {#security}

MCP 服务器的工具拥有你授予该服务器的全部权限。在连接服务器之前：

- 只连接你信任的服务器。工具描述和结果会发送给模型，其中可能包含针对模型的指令（提示词注入）。
- 使用 `include` 只暴露聊天所需的工具，尤其是当服务器具备写入或删除能力时。
- 将 MCP 服务器的令牌保存在服务端。浏览器中传给客户端的任何内容都对用户可见。
