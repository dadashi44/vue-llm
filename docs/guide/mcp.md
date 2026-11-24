---
description: 'Use MCP (Model Context Protocol) servers in Vue: turn the tools of any MCP server into tools for useChat and createLLMHandler with mcpTools, and let users connect their own servers with useMCP and useMCPServers.'
---

# MCP

[MCP](https://modelcontextprotocol.io) (Model Context Protocol) is a standard way to give a model tools: search, files, GitHub, databases and [hundreds of others](https://github.com/modelcontextprotocol/servers). `mcpTools` from `vue-llm/mcp` takes a connected MCP client and turns the tools of its server into regular vue-llm tools, so the model can call them in `useChat` and `createLLMHandler`. To let each user connect their own servers (Notion, Linear…) from the chat, see [Let users connect their own servers](#let-users-connect-their-own-servers).

## Setup

`mcpTools` uses the client from the official SDK, and vue-llm does not bundle it. Install it next to vue-llm (`useMCP` and `useMCPServers` don't need it):

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

## Let users connect their own servers

`mcpTools` connects servers you choose, with your credentials. `useMCP` and `useMCPServers` let each person using your chat connect *their own* MCP servers — their Notion, their Linear — the way Claude and ChatGPT let users add connectors. The user clicks "Connect", signs in to the provider in a popup, and the chat gets that server's tools. vue-llm has its own MCP client for this, so you don't need `@modelcontextprotocol/sdk`.

### Two modes

The frontend API is the same in both; you pick the mode per app.

| | Browser mode | Server mode |
|---|---|---|
| Enable | `useMCPServers({ catalog })` | `useMCPServers({ server: '/api/mcp' })` + `createMCPConnector` on the backend |
| Who talks to the MCP server | the user's browser | your backend |
| User tokens | browser storage (`localStorage` by default) | your store (database, KV), encrypted |
| Exposed to XSS on your app | yes | no — the browser never sees provider tokens |
| Needs a backend | no | yes (a chat usually has one already for the model API key) |
| Servers that work | those whose sign-in and CORS work from a browser: verified with Notion and Linear; Hugging Face and DeepWiki checked for browser access | Streamable HTTP servers whose sign-in can run on a backend; tested with the test servers in the vue-llm repo. GitHub needs your own OAuth app and is expected to work, but hasn't been verified yet |
| Where tools run | `useChat` in the browser | `createLLMHandler` on the server |

Use server mode in production. Browser mode is the quick start when you have no backend.

### Browser mode

#### The callback page

After sign-in the provider redirects the popup to a page of your app, by default `/mcp/callback`. That page calls `handleMCPCallback()`, which hands the result to the chat window and closes the popup. With Vue Router:

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

Any page on the same origin works, for example a static `public/mcp/callback.html`:

```html
<script type="module">
  import { handleMCPCallback } from 'https://cdn.jsdelivr.net/npm/vue-llm@1/dist/mcp.js'
  handleMCPCallback()
</script>
```

Use `callbackUrl` to choose another path, and keep it stable: the provider remembers it when your app registers.

#### Several servers: `useMCPServers`

`useMCPServers` keeps a list of servers: a catalog you define, which the user turns on and off, and, with `allowCustom`, servers the user adds by URL. `mcpServers` from `vue-llm/mcp` has presets for Notion, Linear, Hugging Face, DeepWiki and GitHub (see [which servers work in the browser](#which-servers-work-in-the-browser)).

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

`tools` holds the tools of every enabled server that is `ready`. Each tool name starts with its server's id (`notion_search`, `linear_create_issue`), so servers never collide. `useChat` reads the list before every request, so tools appear as soon as a server connects.

Render the list however you like:

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

| Method | What it does |
|--------|-------------|
| `enable(id)` | Turns a server on and connects with stored credentials. Never opens a popup: if sign-in is needed, the state becomes `needs-auth`. |
| `authorize(id)` | Opens the sign-in popup (and turns the server on). Call it from a click: browsers block popups opened later. |
| `disable(id)` | Turns a server off and keeps the sign-in. |
| `add({ url, name? })` | Adds a server by URL (needs `allowCustom`) and returns its id, made from the host (`mcp.example.com` → `example`). `https://` only, `http://localhost` for development. An invalid URL doesn't throw: the entry shows `failed` with the reason. A URL that is already in the list returns that server's id instead of adding it twice. Up to 20 added servers, URLs up to 2048 characters and names up to 100. |
| `remove(id)` | Forgets a server the user added, with its tokens. Catalog servers can only be turned off. |
| `refresh()` | Reconnects every enabled server. |

Each item of `list` has `id`, `name`, `url`, `custom`, `enabled`, `state`, `error`, `authUrl` and `tools`. Which servers are on and which servers the user added are saved in the same storage as the tokens.

The states are `idle` (off), `connecting`, `needs-auth`, `authorizing` (the popup is open), `ready` and `failed`. If the browser blocked the popup, the state stays `authorizing` and `authUrl` holds the sign-in URL: show it as a link, as above.

Options: `catalog`, `allowCustom` (default `false`), `callbackUrl`, `clientName` (shown on the provider's consent screen; default `document.title`) and `storage`.

#### Limiting tools {#limiting-tools}

Every tool of every enabled server goes to the model, with its description and input schema. Notion (77 tools) and Linear (70) together already exceed OpenAI's limit of 128 tools per request, and each schema costs prompt tokens on every turn. Give a catalog entry `include` (only these tools) or `exclude` (everything except these), by the tools' names on the MCP server:

```ts
const connectors = useMCPServers({
  catalog: [
    { ...mcpServers.notion, include: ['notion-search', 'notion-fetch'] },
    { id: 'docs', url: 'https://mcp.example.com/mcp', exclude: ['delete_page'] },
  ],
})
```

In server mode set them on the connector's `servers` the same way; the frontend's catalog doesn't filter there. Servers the user adds get all their tools.

#### One server: `useMCP`

For a single server, `useMCP` gives you the same state directly:

```ts
import { useMCP } from 'vue-llm'

const notion = useMCP({ url: 'https://mcp.notion.com/mcp', prefix: 'notion' })

useChat({ provider: ai, model: 'gpt-4o', tools: () => notion.tools.value })
```

```vue
<button v-if="notion.state.value === 'needs-auth'" @click="notion.authorize()">Connect Notion</button>
```

| Option | Description |
|--------|-------------|
| `url` | The server's Streamable HTTP endpoint |
| `prefix`, `include`, `exclude` | As in [`mcpTools`](#options) |
| `autoConnect` | Connect on mount with stored credentials. Default `true`. Never opens a popup. |
| `callbackUrl` | Default `${location.origin}/mcp/callback` |
| `clientName` | Shown on the provider's consent screen. Default `document.title` |
| `storage` | `'local'` (default), `'session'`, `'memory'` or your own adapter |

It returns `state`, `tools`, `error`, `authUrl`, `serverInfo` (name and version from the server) and `connect()`, `authorize()`, `disconnect()` (closes the session, keeps the sign-in) and `logout()`.

`logout()` (and `remove()` in `useMCPServers`) forgets the user's sign-in: the tokens are deleted. Your app's registration with the provider is kept, so the next sign-in doesn't register again.

#### Which servers work in the browser

In browser mode the browser itself calls the MCP server, its sign-in metadata, registration and token endpoints. That works only when the server allows it with CORS and supports dynamic client registration and PKCE.

- Verified with a real sign-in: **Notion** and **Linear**.
- Checked for browser access (CORS and sign-in metadata): **Hugging Face** and **DeepWiki** (DeepWiki needs no sign-in).
- As of November 2026 these servers don't allow browser access, so use server mode for them: GitHub (no dynamic client registration, no CORS on the token endpoint), Vercel and Stripe (no CORS on the MCP endpoint), Asana (no CORS on the MCP endpoint, no dynamic registration), Atlassian (CORS doesn't allow the `Authorization` header).

When a server blocks the browser, the entry fails with `MCPUnsupportedServerError` and a message that points to server mode. `mcpServers.github` is shown in the list as `failed` in browser mode.

Let servers connect first (`autoConnect`, or `enable()`) before you offer a "Sign in" button. A server that blocks browsers then shows `failed` right away, without opening a popup the user signs in to for nothing.

#### Where tokens are kept

`storage` decides where tokens, client registrations and the list are kept:

- `'local'` (default) — `localStorage`; the user stays signed in across visits.
- `'session'` — `sessionStorage`; signed out when the tab closes.
- `'memory'` — nothing is saved; signed out on reload.
- your own adapter: `{ get(key), set(key, value), remove(key) }`, sync or async.

Tokens in browser storage can be read by any script on the page: an XSS hole in your app exposes them. Use `'session'` or `'memory'` for stricter setups, or server mode, where the browser never gets the tokens.

### Server mode

`createMCPConnector` from `vue-llm/server` runs the sign-in and the MCP connections on your backend. Tokens are kept in your store, encrypted, and never reach the browser. The tools run in [`createLLMHandler`](./server#server-tools), and their calls stream to `useChat` as usual. Nuxt example:

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
  secret: process.env.MCP_SECRET,
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

`toolsFor(request)` returns the tools of that user's enabled, connected servers. A server that fails or needs sign-in again is skipped, so it never breaks the chat.

On the frontend, pass `server` instead of a catalog. The list comes from the backend:

```ts
import { useChat, useMCPServers } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'

const connectors = useMCPServers({ server: '/api/mcp' })

const chat = useChat({
  provider: createProxyProvider('/api/chat'),
  onFinish: () => connectors.refresh(),
})
```

The same template works. `connectors.tools` stays empty, because the tools run on the server. The list is loaded again on `refresh()`, when the window gets focus and after a sign-in. Calling `refresh()` in `onFinish` shows a server that was skipped during the answer (for example, one that needs sign-in again) right after it. A server that is turned off shows `idle`. For a single server use `useMCP({ id: 'notion', server: '/api/mcp' })`.

If your API uses bearer tokens instead of cookies, pass `headers` (a plain object, ref or getter), and `fetch` if you need your own. `credentials` defaults to `'include'`.

You don't write a callback page in server mode: the connector serves it at `${publicUrl}${basePath}/callback`. The page doesn't finish the sign-in itself. It hands the provider's response to the window that opened it, and `useMCP` / `useMCPServers` send it to `POST {server}/servers/:id/complete` with the user's session. The popup must keep its opener; when `publicUrl` is on the frontend's origin, a `BroadcastChannel` message is sent as well.

| Option | Description |
|--------|-------------|
| `basePath` | Where `handler` is mounted, e.g. `'/api/mcp'` |
| `publicUrl` | Required. The absolute origin of your app. The sign-in callback is `${publicUrl}${basePath}/callback`; it is never taken from request headers. |
| `allowedOrigins` | Frontend origins allowed to call the routes (CORS with credentials, CSRF check). Default: the origin of `publicUrl` |
| `servers` | The catalog every user can turn on: presets or `{ id, url, name?, oauth? }`. Each takes `include` / `exclude` (see [Limiting tools](#limiting-tools)) |
| `user` | Required. Returns the signed-in user's id for a request, or `null` (the routes then answer 401) |
| `store` | Where tokens, registrations and each user's list live: any `get`/`set`/`remove`, sync or async. Nitro's `useStorage()` and unstorage fit as is. |
| `secret` | Encrypts every stored value (AES-GCM). Required when `NODE_ENV` is `production`; in development, without it, values are stored in plain text and a warning is logged. |
| `allowCustom` | Lets users add servers by URL. Default `false`. Up to 20 per user, URLs up to 2048 characters and names up to 100 (400 otherwise); a URL already in the user's list gets 409 with that server's `id`. See [Security notes](#security-notes). |
| `allowHosts` | Host patterns (`example.com`, `*.example.com`) allowed for user-added servers and their sign-in |
| `timeout` | Deadline for connecting to one server, in ms. Default `10000`; a slower server is skipped and shown as an error. |
| `clientName` | Shown on the provider's consent screen. Default: the host of `publicUrl` |
| `fetch` | Used for every outbound request |

#### GitHub

GitHub through server mode is expected to work but hasn't been verified with vue-llm yet. GitHub's MCP server has no dynamic client registration, so register an OAuth app yourself: on GitHub, **Settings → Developer settings → OAuth Apps → New OAuth App**, with the callback URL `${publicUrl}${basePath}/callback` (for the example above, `https://app.example.com/api/mcp/callback`). Then pass its credentials:

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

The same `oauth` option works for any server that requires a pre-registered client.

### Security notes

- **User-added servers see what the model sends them and can talk back to it.** A server the user adds receives the tool calls the model makes to it, and its tool descriptions and results go to the model, so it can try prompt injection. Show the server's host before the user signs in (as in the template above), and keep `allowCustom` off if you don't need it.
- **Server mode fetches URLs chosen by users** (`allowCustom`). The connector only accepts `https://`, always refuses loopback, private, link-local and cloud metadata addresses, and checks every redirect. On top of that:
  - In production, set `allowHosts`. List the hosts of the servers you allow *and* the hosts their sign-in uses (the authorization server), or their sign-in is refused.
  - Without `allowHosts`, each host is resolved with `node:dns` (Node, Bun, Deno) and refused if any address is private. This check can't rule out DNS rebinding — another reason to set `allowHosts`.
  - On edge runtimes without `node:dns` (Cloudflare Workers, edge functions), `allowCustom` requires `allowHosts`: without it, adding a server fails with an error that says so.
- **Sign-in metadata must be exact.** The `issuer` in a provider's authorization-server metadata must match the authorization server URL exactly (RFC 8414); a server that gets this wrong can't be signed in to.
- In server mode the routes check the `Origin` header against `allowedOrigins` (changes without one are refused) and require a signed-in `user`. Provider tokens never appear in a response to the browser.
- **A sign-in is bound to the user who started it.** The callback page only passes the provider's response to the opener; the backend saves tokens only when `POST /servers/:id/complete` comes from the same `user` (and for the same server) that called `authorize`. If someone sends another person their sign-in link, that person's account isn't linked to the sender's user.
