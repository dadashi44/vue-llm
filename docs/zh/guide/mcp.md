---
description: '在 Vue 中使用 MCP（Model Context Protocol）服务器：通过 mcpTools 将任意 MCP 服务器的工具转换为 useChat 和 createLLMHandler 可用的工具，并通过 useMCP 和 useMCPServers 让用户连接自己的服务器。'
---

# MCP

[MCP](https://modelcontextprotocol.io)（Model Context Protocol）是一种为模型提供工具的标准方式：搜索、文件、GitHub、数据库以及[数百种其他工具](https://github.com/modelcontextprotocol/servers)。`vue-llm/mcp` 中的 `mcpTools` 接收一个已连接的 MCP 客户端，将其服务器上的工具转换为普通的 vue-llm 工具，模型便可以在 `useChat` 和 `createLLMHandler` 中调用它们。 如需让每位用户在聊天中连接自己的服务器（Notion、Linear……），请参阅[让用户连接自己的服务器](#let-users-connect-their-own-servers)。

## 安装 {#setup}

`mcpTools` 使用官方 SDK 中的客户端，vue-llm 不会将其打包进来。请与 vue-llm 一起安装（`useMCP` 和 `useMCPServers` 不需要它）：

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

## 让用户连接自己的服务器 {#let-users-connect-their-own-servers}

`mcpTools` 连接的是你选定的服务器，使用的是你的凭据。`useMCP` 和 `useMCPServers` 则让聊天的每位用户连接*他们自己的* MCP 服务器——自己的 Notion、自己的 Linear——就像 Claude 和 ChatGPT 里的连接器那样。用户点击“连接”，在弹窗中登录服务提供方，聊天就获得了该服务器的工具。为此 vue-llm 自带了 MCP 客户端，因此你不需要 `@modelcontextprotocol/sdk`。

### 两种模式 {#two-modes}

两种模式下前端 API 完全相同，你只需为整个应用选择一种模式。

| | 浏览器模式 | 服务端模式 |
|---|---|---|
| 启用方式 | `useMCPServers({ catalog })` | `useMCPServers({ server: '/api/mcp' })` + 后端的 `createMCPConnector` |
| 谁与 MCP 服务器通信 | 用户的浏览器 | 你的后端 |
| 用户令牌 | 浏览器存储（默认 `localStorage`） | 你的存储（数据库、KV），加密保存 |
| 是否暴露于你应用的 XSS | 是 | 否——浏览器永远看不到服务提供方的令牌 |
| 是否需要后端 | 不需要 | 需要（聊天通常已经有后端，用来保管模型的 API 密钥） |
| 可用的服务器 | 登录和 CORS 能在浏览器中正常工作的服务器：已验证 Notion 和 Linear；Hugging Face 和 DeepWiki 已检查过浏览器访问 | 登录可以在后端完成的 Streamable HTTP 服务器：已通过 `createMCPConnector` 手动验证 Notion 和 DeepWiki（2026 年 11 月）。GitHub 需要你自己的 OAuth 应用，预计可用，但尚未验证 |
| 工具在哪里运行 | 浏览器中的 `useChat` | 服务端的 `createLLMHandler` |

生产环境请使用服务端模式。没有后端时，浏览器模式是快速上手的方式。

### 浏览器模式 {#browser-mode}

#### 回调页面 {#the-callback-page}

登录完成后，服务提供方会把弹窗重定向到你应用中的一个页面，默认是 `/mcp/callback`。该页面调用 `handleMCPCallback()`，它会把结果交给聊天窗口并关闭弹窗。以 Vue Router 为例：

```ts
// router.ts
{ path: '/mcp/callback', component: () => import('./McpCallback.vue') }
```

```vue
<!-- McpCallback.vue (in Nuxt: pages/mcp/callback.vue) -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { handleMCPCallback } from 'vue-llm/mcp'

onMounted(() => handleMCPCallback())
</script>

<template>
  <p>Signing in…</p>
</template>
```

同源下的任何页面都可以，例如静态的 `public/mcp/callback.html`：

```html
<script type="module">
  import { handleMCPCallback } from 'https://cdn.jsdelivr.net/npm/vue-llm@1/dist/mcp.js'
  handleMCPCallback()
</script>
```

可以用 `callbackUrl` 指定其他路径，并保持它稳定：应用注册时，服务提供方会记住这个地址。

#### 多个服务器：`useMCPServers` {#several-servers-usemcpservers}

`useMCPServers` 维护一个服务器列表：由你定义的目录（catalog），用户可以开启和关闭其中的服务器；设置 `allowCustom` 后，用户还可以通过 URL 添加服务器。`vue-llm/mcp` 中的 `mcpServers` 为 Notion、Linear、Hugging Face、DeepWiki 和 GitHub 提供了预设（见[哪些服务器可在浏览器中使用](#which-servers-work-in-the-browser)）。

```ts
import { ref } from 'vue'
import { useChat, useMCPServers } from 'vue-llm'
import { mcpServers } from 'vue-llm/mcp'

const connectors = useMCPServers({
  catalog: [
    mcpServers.notion,
    mcpServers.linear,
    mcpServers.huggingface,
    { id: 'docs', name: 'DeepWiki', url: 'https://mcp.deepwiki.com/mcp' },
  ],
  allowCustom: true,
})

const chat = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: () => [...connectors.tools.value, getWeather],
})

const newUrl = ref('')
```

`tools` 包含所有已开启且处于 `ready` 状态的服务器的工具。每个工具名都以其服务器的 id 开头（`notion_search`、`linear_create_issue`），因此不同服务器之间不会冲突。`useChat` 在每次请求前读取这个列表，所以服务器一连接上，工具就会出现。

列表的渲染方式由你决定：

```vue
<template>
  <ul>
    <li v-for="server in connectors.list.value" :key="server.id">
      {{ server.name }} <small>{{ server.url }}</small>

      <button v-if="!server.enabled" @click="connectors.enable(server.id)">Turn on</button>
      <template v-else>
        <button v-if="server.state === 'needs-auth'" @click="connectors.authorize(server.id)">Sign in</button>
        <span v-else-if="server.state === 'authorizing'">
          Waiting for sign-in…
          <a v-if="server.authUrl" :href="server.authUrl" target="_blank">open the sign-in page</a>
        </span>
        <span v-else-if="server.state === 'ready'">{{ server.tools.length }} tools</span>
        <span v-else-if="server.state === 'failed'">{{ server.error?.message }}</span>
        <button @click="connectors.disable(server.id)">Turn off</button>
      </template>

      <button v-if="server.custom" @click="connectors.remove(server.id)">Remove</button>
    </li>
  </ul>

  <form @submit.prevent="connectors.add({ url: newUrl })">
    <input v-model="newUrl" placeholder="https://mcp.example.com/mcp">
    <button>Add server</button>
  </form>
</template>
```

| 方法 | 作用 |
|--------|-------------|
| `enable(id)` | 开启服务器，并使用已保存的凭据连接。不会打开弹窗：如果需要登录，状态会变为 `needs-auth`。 |
| `authorize(id)` | 打开登录弹窗（同时开启该服务器）。请在点击事件中调用：浏览器会拦截稍后才打开的弹窗。 |
| `disable(id)` | 关闭服务器，但保留登录状态。 |
| `add({ url, name? })` | 通过 URL 添加服务器（需要 `allowCustom`），并返回由主机名生成的 id（`mcp.example.com` → `example`）。仅支持 `https://`，开发时可用 `http://localhost`。无效的 URL 不会抛出异常：该条目会显示为 `failed` 并给出原因。已在列表中的 URL 会返回该服务器的 id，而不会重复添加。最多添加 20 个服务器，URL 最长 2048 个字符，名称最长 100 个字符。 |
| `remove(id)` | 移除用户添加的服务器，并删除其令牌。目录中的服务器只能关闭。 |
| `refresh()` | 重新连接所有已开启的服务器。 |

`list` 的每一项都有 `id`、`name`、`url`、`custom`、`enabled`、`state`、`error`、`authUrl` 和 `tools`。哪些服务器已开启、用户添加了哪些服务器，都保存在与令牌相同的存储中。

状态有 `idle`（已关闭）、`connecting`、`needs-auth`、`authorizing`（弹窗已打开）、`ready` 和 `failed`。如果浏览器拦截了弹窗，状态会保持为 `authorizing`，`authUrl` 中是登录地址：像上面那样把它显示为链接即可。

选项：`catalog`、`allowCustom`（默认 `false`）、`callbackUrl`、`clientName`（显示在服务提供方的授权确认页面上；默认 `document.title`）和 `storage`。

#### 限制工具 {#limiting-tools}

每个已开启服务器的所有工具，连同描述和输入 schema，都会发送给模型。仅 Notion（77 个工具）和 Linear（70 个）加起来就已超过 OpenAI 每次请求 128 个工具的上限，而且每个 schema 在每一轮对话中都会消耗提示词 token。可以为目录条目设置 `include`（只保留这些工具）或 `exclude`（除这些之外的全部工具），名称为工具在 MCP 服务器上的名称：

```ts
const connectors = useMCPServers({
  catalog: [
    { ...mcpServers.notion, include: ['notion-search', 'notion-fetch'] },
    { id: 'docs', url: 'https://mcp.example.com/mcp', exclude: ['delete_page'] },
  ],
})
```

在服务端模式下，以同样的方式在连接器的 `servers` 上设置；前端的 catalog 在那里不起过滤作用。用户自行添加的服务器会获得它的全部工具。

#### 单个服务器：`useMCP` {#one-server-usemcp}

只有一个服务器时，`useMCP` 直接提供同样的状态：

```ts
import { useMCP } from 'vue-llm'

const notion = useMCP({ url: 'https://mcp.notion.com/mcp', prefix: 'notion' })

useChat({ provider: ai, model: 'gpt-4o', tools: () => notion.tools.value })
```

```vue
<button v-if="notion.state.value === 'needs-auth'" @click="notion.authorize()">Connect Notion</button>
```

| 选项 | 说明 |
|--------|-------------|
| `url` | 服务器的 Streamable HTTP 端点 |
| `prefix`、`include`、`exclude` | 与 [`mcpTools`](#options) 相同 |
| `autoConnect` | 挂载时使用已保存的凭据连接。默认 `true`。不会打开弹窗。 |
| `callbackUrl` | 默认 `${location.origin}/mcp/callback` |
| `clientName` | 显示在服务提供方的授权确认页面上。默认 `document.title` |
| `storage` | `'local'`（默认）、`'session'`、`'memory'` 或你自己的适配器 |

它返回 `state`、`tools`、`error`、`authUrl`、`serverInfo`（服务器提供的名称和版本），以及 `connect()`、`authorize()`、`disconnect()`（关闭会话，保留登录状态）和 `logout()`。

`logout()`（以及 `useMCPServers` 中的 `remove()`）会清除用户的登录状态：令牌会被删除。你的应用在服务提供方处的注册信息会保留，因此下次登录不需要重新注册。

#### 哪些服务器可在浏览器中使用 {#which-servers-work-in-the-browser}

在浏览器模式下，由浏览器自己调用 MCP 服务器及其登录元数据、注册端点和令牌端点。只有当服务器通过 CORS 允许这样做，并且支持动态客户端注册和 PKCE 时，才能正常工作。

- 已通过真实登录验证：**Notion** 和 **Linear**。
- 已检查浏览器访问（CORS 和登录元数据）：**Hugging Face** 和 **DeepWiki**（DeepWiki 无需登录）。
- 截至 2026 年 11 月，以下服务器不允许浏览器访问，请对它们使用服务端模式：GitHub（无动态客户端注册，令牌端点无 CORS）、Vercel 和 Stripe（MCP 端点无 CORS）、Asana（MCP 端点无 CORS，无动态注册）、Atlassian（CORS 不允许 `Authorization` 请求头）。

当服务器拒绝浏览器访问时，该条目会以 `MCPUnsupportedServerError` 失败，并给出指向服务端模式的提示。在浏览器模式下，`mcpServers.github` 会在列表中显示为 `failed`。

请先让服务器完成连接（`autoConnect` 或 `enable()`），再提供“登录”按钮。这样，拒绝浏览器访问的服务器会立即显示 `failed`，不会打开一个用户白白登录的弹窗。

#### 令牌保存在哪里 {#where-tokens-are-kept}

`storage` 决定令牌、客户端注册信息和服务器列表保存在哪里：

- `'local'`（默认）：`localStorage`；用户在多次访问之间保持登录。
- `'session'`：`sessionStorage`；关闭标签页后退出登录。
- `'memory'`：不保存任何内容；刷新页面后退出登录。
- 你自己的适配器：`{ get(key), set(key, value), remove(key) }`，同步或异步均可。

浏览器存储中的令牌可以被页面上的任何脚本读取：你的应用一旦出现 XSS 漏洞，令牌就会泄露。要求更严格时，请使用 `'session'` 或 `'memory'`，或者使用服务端模式，浏览器永远拿不到令牌。

### 服务端模式 {#server-mode}

`vue-llm/server` 中的 `createMCPConnector` 在你的后端完成登录和 MCP 连接。令牌加密后保存在你的存储中，永远不会到达浏览器。工具在 [`createLLMHandler`](./server#server-tools) 中运行，调用过程照常流式传输给 `useChat`。Nuxt 示例：

```ts
// server/utils/mcp.ts
import { createMCPConnector } from 'vue-llm/server'
import { mcpServers } from 'vue-llm/mcp'

export const mcp = createMCPConnector({
  basePath: '/api/mcp',
  publicUrl: 'https://app.example.com',
  servers: [mcpServers.notion, mcpServers.linear, mcpServers.deepwiki],
  user: request => getUserId(request), // your auth: a stable user id, or null when signed out
  store: useStorage('mcp'),
  secret: process.env.MCP_SECRET, // generate with: openssl rand -base64 32
})
```

```ts
// server/api/mcp/[...path].ts
export default defineEventHandler(event => mcp.handler(toWebRequest(event)))
```

```ts
// server/api/chat.post.ts
import { createOpenAI } from 'vue-llm/providers'
import { createLLMHandler } from 'vue-llm/server'

const handler = createLLMHandler({
  provider: createOpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
  model: 'gpt-4o',
  tools: request => mcp.toolsFor(request),
})

export default defineEventHandler(event => handler(toWebRequest(event)))
```

`toolsFor(request)` 返回该用户已开启且已连接的服务器的工具。连接失败或需要重新登录的服务器会被跳过，因此不会影响聊天。

在前端传入 `server` 而不是 catalog，列表由后端提供：

```ts
import { useChat, useMCPServers } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'

const connectors = useMCPServers({ server: '/api/mcp' })

const chat = useChat({
  provider: createProxyProvider('/api/chat'),
  onFinish: () => connectors.refresh(),
})
```

同一个模板依然适用。`connectors.tools` 始终为空，因为工具在服务端运行。列表会在 `refresh()` 时、窗口获得焦点时以及登录之后重新加载。在 `onFinish` 中调用 `refresh()`，可以让回答期间被跳过的服务器（例如需要重新登录的服务器）立刻显示出来。已关闭的服务器显示为 `idle`。对于单个服务器，使用 `useMCP({ id: 'notion', server: '/api/mcp' })`。

如果你的 API 使用 bearer 令牌而不是 cookie，请传入 `headers`（普通对象、ref 或 getter）；需要自定义请求时还可以传入 `fetch`。`credentials` 默认为 `'include'`。

服务端模式下你不需要编写回调页面：连接器会在 `${publicUrl}${basePath}/callback` 提供它。该页面本身并不完成登录，它只是把服务提供方的响应交给打开它的窗口，再由 `useMCP` / `useMCPServers` 连同用户的会话一起发送到 `POST {server}/servers/:id/complete`。弹窗必须保留它的 opener；当 `publicUrl` 与前端同源时，还会同时发送一条 `BroadcastChannel` 消息。

| 选项 | 说明 |
|--------|-------------|
| `basePath` | `handler` 挂载的路径，例如 `'/api/mcp'` |
| `publicUrl` | 必填。应用的绝对源（origin）。登录回调地址为 `${publicUrl}${basePath}/callback`；它绝不会取自请求头。 |
| `allowedOrigins` | 允许调用这些路由的前端源（带凭据的 CORS，CSRF 检查）。默认：`publicUrl` 的源 |
| `servers` | 每个用户都可以开启的目录：预设或 `{ id, url, name?, oauth? }`。每项都支持 `include` / `exclude`（见[限制工具](#limiting-tools)） |
| `user` | 必填。返回请求对应的已登录用户 id，未登录时返回 `null`（此时路由返回 401） |
| `store` | 令牌、注册信息和每个用户列表的存放位置：任何带 `get`/`set`/`remove` 的对象，同步或异步均可。Nitro 的 `useStorage()` 和 unstorage 可直接使用。 |
| `secret` | 加密所有存储的值（AES-GCM）。当 `NODE_ENV` 为 `production` 时必填；开发环境中如果没有它，值会以明文保存并输出警告。可用 `openssl rand -base64 32` 生成随机值，并放在代码之外（环境变量）。 |
| `allowCustom` | 允许用户通过 URL 添加服务器。默认 `false`。每个用户最多 20 个，URL 最长 2048 个字符，名称最长 100 个字符（超出返回 400）；用户列表中已有的 URL 会返回 409 以及该服务器的 `id`。见[安全说明](#security-notes)。 |
| `allowHosts` | 允许用户添加的服务器及其登录所使用的主机模式（`example.com`、`*.example.com`） |
| `timeout` | 连接单个服务器的时限，单位毫秒。默认 `10000`；更慢的服务器会被跳过并显示为错误。 |
| `clientName` | 显示在服务提供方的授权确认页面上。默认：`publicUrl` 的主机名 |
| `fetch` | 用于所有出站请求 |

#### GitHub {#github}

通过服务端模式使用 GitHub 预计可用，但尚未在 vue-llm 中验证。GitHub 的 MCP 服务器不支持动态客户端注册，所以你需要自己注册一个 OAuth 应用：在 GitHub 上进入 **Settings → Developer settings → OAuth Apps → New OAuth App**，回调地址填 `${publicUrl}${basePath}/callback`（对于上面的示例，即 `https://app.example.com/api/mcp/callback`）。然后传入它的凭据：

```ts
servers: [
  mcpServers.notion,
  {
    ...mcpServers.github,
    oauth: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scopes: ['…'], // optional: the GitHub scopes the tools you use need
    },
  },
],
```

同样的 `oauth` 选项适用于任何要求预先注册客户端的服务器。

### 安全说明 {#security-notes}

- **用户添加的服务器能看到模型发给它的内容，也能反过来影响模型。** 用户添加的服务器会收到模型对它发起的工具调用，而它的工具描述和结果会进入模型，所以它可能尝试提示词注入。请在用户登录之前显示服务器的主机名（如上面的模板），并且在不需要时保持 `allowCustom` 关闭。
- **服务端模式会请求用户选定的 URL**（`allowCustom`）。连接器只接受 `https://`，始终拒绝回环、私有、链路本地以及云元数据地址，并检查每一次重定向。除此之外：
  - 在生产环境中请设置 `allowHosts`。列出你允许的服务器的主机，*以及*它们登录所用的主机（授权服务器），否则它们的登录会被拒绝。
  - 未设置 `allowHosts` 时，每个主机都会用 `node:dns`（Node、Bun、Deno）解析，只要有任何一个地址是私有地址就会被拒绝。这项检查无法排除 DNS rebinding，这是设置 `allowHosts` 的另一个理由。
  - 在没有 `node:dns` 的边缘运行时（Cloudflare Workers、edge functions）中，`allowCustom` 要求同时设置 `allowHosts`：否则添加服务器会失败，并给出说明原因的错误。
- **登录元数据必须精确。** 服务提供方的授权服务器元数据中的 `issuer` 必须与授权服务器 URL 完全一致（RFC 8414）；在这一点上出错的服务器无法登录。
- 在服务端模式下，路由会根据 `allowedOrigins` 检查 `Origin` 请求头（没有该请求头的修改类请求会被拒绝），并要求已登录的 `user`。服务提供方的令牌绝不会出现在返回给浏览器的响应中。
- **登录与发起它的用户绑定。** 回调页面只是把服务提供方的响应交给 opener；只有当 `POST /servers/:id/complete` 来自调用过 `authorize` 的同一个 `user`（且针对同一个服务器）时，后端才会保存令牌。如果有人把自己的登录链接发给别人，对方的账号不会被关联到发送者的用户上。
