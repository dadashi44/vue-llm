---
description: 'Use MCP (Model Context Protocol) servers in Vue: turn the tools of any MCP server into tools for useChat and createLLMHandler with mcpTools.'
---

# MCP

[MCP](https://modelcontextprotocol.io) (Model Context Protocol) is a standard way to give a model tools: search, files, GitHub, databases and [hundreds of others](https://github.com/modelcontextprotocol/servers). `mcpTools` from `vue-llm/mcp` takes a connected MCP client and turns the tools of its server into regular vue-llm tools, so the model can call them in `useChat` and `createLLMHandler`.

## Setup

vue-llm uses the client from the official SDK and does not bundle it. Install it next to vue-llm:

```bash
npm i @modelcontextprotocol/sdk
```

## On the server

Run MCP on the server when the MCP server needs an API key, or runs locally (stdio). The handler calls the tools itself and streams the results to the browser:

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

For a local MCP server, connect with stdio instead:

```ts
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

await client.connect(new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', './docs'],
}))
```

On the client nothing changes: `useChat` with [`createProxyProvider`](./server) shows each MCP call as a `tool-call` part with its result, and [`MessageParts`](./components#messageparts) and [DevTools](./devtools) show it like any other tool.

## In the browser

A public MCP server that needs no secrets can be used directly from `useChat`. The server has to allow your origin with CORS and expose the `Mcp-Session-Id` header.

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

`useChat` runs the calls, sends the results to the model and continues, as with any [tool with `execute`](./tool-calling). Stopping the chat aborts the MCP call in progress.

## Options

```ts
await mcpTools(client, {
  include: ['search', 'fetch'], // only these tools
  exclude: ['delete_file'],     // or everything except these
  prefix: 'github',             // github_search, github_fetch…
})
```

| Option | Description |
|--------|-------------|
| `include` | Only these tools, by their name on the MCP server |
| `exclude` | Leave out these tools |
| `prefix` | Added before each name as `prefix_name`. Use it when you combine tools from several servers. |
| `signal` | Cancels listing the tools |

Tools from several servers can be combined in one list:

```ts
tools: [
  ...await mcpTools(github, { prefix: 'github' }),
  ...await mcpTools(docs, { prefix: 'docs' }),
  getWeather,
]
```

## Results

- If the tool returns `structuredContent`, the model gets that object.
- If it returns only text, the model gets the text.
- Other content (images, resources) is passed on as the MCP content array.
- If the tool reports an error (`isError`), the call ends in the `error` state with the tool's message, and the model can recover.

Characters that providers don't accept in tool names (anything except letters, digits, `_` and `-`) are replaced with `_`. The MCP server is always called with the original name.

## Security

An MCP server's tools run with whatever access you give that server. Before you connect one:

- Connect only servers you trust. Tool descriptions and results go to the model and can contain instructions aimed at it (prompt injection).
- Use `include` to expose only the tools the chat needs, especially when a server can write or delete.
- Keep tokens for MCP servers on the server. Anything passed to the client in the browser is visible to users.
