---
description: 'Usa servidores MCP (Model Context Protocol) en Vue: convierte las herramientas de cualquier servidor MCP en herramientas para useChat y createLLMHandler con mcpTools.'
---

# MCP

[MCP](https://modelcontextprotocol.io) (Model Context Protocol) es una forma estándar de darle herramientas a un modelo: búsqueda, archivos, GitHub, bases de datos y [cientos más](https://github.com/modelcontextprotocol/servers). `mcpTools` de `vue-llm/mcp` recibe un cliente MCP conectado y convierte las herramientas de su servidor en herramientas normales de vue-llm, para que el modelo pueda llamarlas en `useChat` y `createLLMHandler`.

## Instalación {#setup}

vue-llm usa el cliente del SDK oficial y no lo incluye en su paquete. Instálalo junto a vue-llm:

```bash
npm i @modelcontextprotocol/sdk
```

## En el servidor {#on-the-server}

Ejecuta MCP en el servidor cuando el servidor MCP necesite una clave de API o se ejecute en local (stdio). El handler llama a las herramientas por su cuenta y envía los resultados al navegador por streaming:

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

Para un servidor MCP local, conéctate por stdio:

```ts
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

await client.connect(new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', './docs'],
}))
```

En el cliente no cambia nada: `useChat` con [`createProxyProvider`](./server) muestra cada llamada MCP como una parte `tool-call` con su resultado, y [`MessageParts`](./components#messageparts) y [DevTools](./devtools) la muestran como cualquier otra herramienta.

## En el navegador {#in-the-browser}

Un servidor MCP público que no necesita secretos se puede usar directamente desde `useChat`. El servidor tiene que permitir tu origen mediante CORS y exponer la cabecera `Mcp-Session-Id`.

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

`useChat` ejecuta las llamadas, envía los resultados al modelo y continúa, igual que con cualquier [herramienta con `execute`](./tool-calling). Detener el chat cancela la llamada MCP en curso.

## Opciones {#options}

```ts
await mcpTools(client, {
  include: ['search', 'fetch'], // only these tools
  exclude: ['delete_file'],     // or everything except these
  prefix: 'github',             // github_search, github_fetch…
})
```

| Opción | Descripción |
|--------|-------------|
| `include` | Solo estas herramientas, por su nombre en el servidor MCP |
| `exclude` | Excluye estas herramientas |
| `prefix` | Se añade antes de cada nombre como `prefix_name`. Úsalo cuando combines herramientas de varios servidores. |
| `signal` | Cancela el listado de las herramientas |

Las herramientas de varios servidores se pueden combinar en una sola lista:

```ts
tools: [
  ...await mcpTools(github, { prefix: 'github' }),
  ...await mcpTools(docs, { prefix: 'docs' }),
  getWeather,
]
```

## Resultados {#results}

- Si la herramienta devuelve `structuredContent`, el modelo recibe ese objeto.
- Si devuelve solo texto, el modelo recibe el texto.
- El resto del contenido (imágenes, recursos) se pasa tal cual como el array de content de MCP.
- Si la herramienta informa de un error (`isError`), la llamada termina en el estado `error` con el mensaje de la herramienta, y el modelo puede recuperarse.

Los caracteres que los proveedores no aceptan en los nombres de herramientas (cualquier cosa que no sea letras, dígitos, `_` y `-`) se sustituyen por `_`. Al servidor MCP siempre se le llama con el nombre original.

## Seguridad {#security}

Las herramientas de un servidor MCP se ejecutan con el acceso que le des a ese servidor. Antes de conectar uno:

- Conecta solo servidores en los que confíes. Las descripciones y los resultados de las herramientas llegan al modelo y pueden contener instrucciones dirigidas a él (prompt injection).
- Usa `include` para exponer solo las herramientas que necesita el chat, sobre todo cuando un servidor puede escribir o borrar.
- Guarda los tokens de los servidores MCP en el servidor. Todo lo que se pasa al cliente en el navegador es visible para los usuarios.
