---
description: 'Usa servidores MCP (Model Context Protocol) en Vue: convierte las herramientas de cualquier servidor MCP en herramientas para useChat y createLLMHandler con mcpTools, y deja que los usuarios conecten sus propios servidores con useMCP y useMCPServers.'
---

# MCP

[MCP](https://modelcontextprotocol.io) (Model Context Protocol) es una forma estándar de darle herramientas a un modelo: búsqueda, archivos, GitHub, bases de datos y [cientos más](https://github.com/modelcontextprotocol/servers). `mcpTools` de `vue-llm/mcp` recibe un cliente MCP conectado y convierte las herramientas de su servidor en herramientas normales de vue-llm, para que el modelo pueda llamarlas en `useChat` y `createLLMHandler`. Para que cada usuario conecte sus propios servidores (Notion, Linear…) desde el chat, consulta [Deja que los usuarios conecten sus propios servidores](#let-users-connect-their-own-servers).

## Instalación {#setup}

`mcpTools` usa el cliente del SDK oficial, y vue-llm no lo incluye en su paquete. Instálalo junto a vue-llm (`useMCP` y `useMCPServers` no lo necesitan):

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

## Deja que los usuarios conecten sus propios servidores {#let-users-connect-their-own-servers}

`mcpTools` conecta los servidores que tú eliges, con tus credenciales. `useMCP` y `useMCPServers` permiten que cada persona que usa tu chat conecte *sus propios* servidores MCP (su Notion, su Linear), igual que Claude y ChatGPT permiten añadir conectores. El usuario pulsa «Conectar», inicia sesión en el proveedor en una ventana emergente y el chat recibe las herramientas de ese servidor. vue-llm tiene su propio cliente MCP para esto, así que no necesitas `@modelcontextprotocol/sdk`.

### Dos modos {#two-modes}

La API del frontend es la misma en ambos; eliges el modo para toda la aplicación.

| | Modo navegador | Modo servidor |
|---|---|---|
| Cómo activarlo | `useMCPServers({ catalog })` | `useMCPServers({ server: '/api/mcp' })` + `createMCPConnector` en el backend |
| Quién habla con el servidor MCP | el navegador del usuario | tu backend |
| Tokens del usuario | almacenamiento del navegador (`localStorage` por defecto) | tu almacén (base de datos, KV), cifrados |
| Expuesto a XSS en tu app | sí | no: el navegador nunca ve los tokens del proveedor |
| Necesita backend | no | sí (un chat suele tenerlo ya, por la clave de API del modelo) |
| Servidores que funcionan | aquellos cuyo inicio de sesión y CORS funcionan desde un navegador: verificado con Notion y Linear; Hugging Face y DeepWiki comprobados en cuanto al acceso desde el navegador | servidores Streamable HTTP cuyo inicio de sesión puede hacerse en un backend: verificado a mano con `createMCPConnector` con Notion y DeepWiki (noviembre de 2026). GitHub necesita tu propia app OAuth y se espera que funcione, pero aún no se ha verificado |
| Dónde se ejecutan las herramientas | `useChat` en el navegador | `createLLMHandler` en el servidor |

Usa el modo servidor en producción. El modo navegador es el inicio rápido cuando no tienes backend.

### Modo navegador {#browser-mode}

#### La página de callback {#the-callback-page}

Tras iniciar sesión, el proveedor redirige la ventana emergente a una página de tu app, por defecto `/mcp/callback`. Esa página llama a `handleMCPCallback()`, que entrega el resultado a la ventana del chat y cierra la ventana emergente. Con Vue Router:

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

Sirve cualquier página del mismo origen, por ejemplo un `public/mcp/callback.html` estático:

```html
<script type="module">
  import { handleMCPCallback } from 'https://cdn.jsdelivr.net/npm/vue-llm@1/dist/mcp.js'
  handleMCPCallback()
</script>
```

Usa `callbackUrl` para elegir otra ruta y mantenla estable: el proveedor la recuerda cuando tu app se registra.

#### Varios servidores: `useMCPServers` {#several-servers-usemcpservers}

`useMCPServers` mantiene una lista de servidores: un catálogo que defines tú, que el usuario activa y desactiva, y, con `allowCustom`, servidores que el usuario añade por URL. `mcpServers` de `vue-llm/mcp` incluye presets para Notion, Linear, Hugging Face, DeepWiki y GitHub (consulta [qué servidores funcionan en el navegador](#which-servers-work-in-the-browser)).

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

`tools` contiene las herramientas de todos los servidores activados que están `ready`. El nombre de cada herramienta empieza por el id de su servidor (`notion_search`, `linear_create_issue`), así que los servidores nunca chocan. `useChat` lee la lista antes de cada petición, por lo que las herramientas aparecen en cuanto un servidor se conecta.

Muestra la lista como quieras:

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

| Método | Qué hace |
|--------|-------------|
| `enable(id)` | Activa un servidor y se conecta con las credenciales guardadas. Nunca abre una ventana emergente: si hace falta iniciar sesión, el estado pasa a `needs-auth`. |
| `authorize(id)` | Abre la ventana emergente de inicio de sesión (y activa el servidor). Llámalo desde un clic: los navegadores bloquean las ventanas emergentes que se abren más tarde. |
| `disable(id)` | Desactiva un servidor y conserva el inicio de sesión. |
| `add({ url, name? })` | Añade un servidor por URL (requiere `allowCustom`) y devuelve su id, creado a partir del host (`mcp.example.com` → `example`). Solo `https://`, y `http://localhost` para desarrollo. Una URL no válida no lanza un error: la entrada aparece como `failed` con el motivo. Una URL que ya está en la lista devuelve el id de ese servidor en lugar de añadirlo dos veces. Hasta 20 servidores añadidos, URLs de hasta 2048 caracteres y nombres de hasta 100. |
| `remove(id)` | Olvida un servidor que añadió el usuario, junto con sus tokens. Los servidores del catálogo solo se pueden desactivar. |
| `refresh()` | Reconecta todos los servidores activados. |

Cada elemento de `list` tiene `id`, `name`, `url`, `custom`, `enabled`, `state`, `error`, `authUrl` y `tools`. Qué servidores están activados y cuáles añadió el usuario se guarda en el mismo almacenamiento que los tokens.

Los estados son `idle` (desactivado), `connecting`, `needs-auth`, `authorizing` (la ventana emergente está abierta), `ready` y `failed`. Si el navegador bloqueó la ventana emergente, el estado se queda en `authorizing` y `authUrl` contiene la URL de inicio de sesión: muéstrala como un enlace, como arriba.

Opciones: `catalog`, `allowCustom` (por defecto `false`), `callbackUrl`, `clientName` (se muestra en la pantalla de consentimiento del proveedor; por defecto `document.title`) y `storage`.

#### Limitar las herramientas {#limiting-tools}

Todas las herramientas de todos los servidores activados van al modelo, con su descripción y su schema de entrada. Notion (77 herramientas) y Linear (70) juntos ya superan el límite de 128 herramientas por petición de OpenAI, y cada schema consume tokens del prompt en cada turno. Dale a una entrada del catálogo `include` (solo estas herramientas) o `exclude` (todo menos estas), con los nombres de las herramientas en el servidor MCP:

```ts
const connectors = useMCPServers({
  catalog: [
    { ...mcpServers.notion, include: ['notion-search', 'notion-fetch'] },
    { id: 'docs', url: 'https://mcp.example.com/mcp', exclude: ['delete_page'] },
  ],
})
```

En modo servidor, defínelos igual en los `servers` del conector; el catálogo del frontend no filtra allí. Los servidores que añade el usuario reciben todas sus herramientas.

#### Un servidor: `useMCP` {#one-server-usemcp}

Para un solo servidor, `useMCP` te da directamente el mismo estado:

```ts
import { useMCP } from 'vue-llm'

const notion = useMCP({ url: 'https://mcp.notion.com/mcp', prefix: 'notion' })

useChat({ provider: ai, model: 'gpt-4o', tools: () => notion.tools.value })
```

```vue
<button v-if="notion.state.value === 'needs-auth'" @click="notion.authorize()">Connect Notion</button>
```

| Opción | Descripción |
|--------|-------------|
| `url` | El endpoint Streamable HTTP del servidor |
| `prefix`, `include`, `exclude` | Como en [`mcpTools`](#options) |
| `autoConnect` | Se conecta al montar, con las credenciales guardadas. Por defecto `true`. Nunca abre una ventana emergente. |
| `callbackUrl` | Por defecto `${location.origin}/mcp/callback` |
| `clientName` | Se muestra en la pantalla de consentimiento del proveedor. Por defecto `document.title` |
| `storage` | `'local'` (por defecto), `'session'`, `'memory'` o tu propio adaptador |

Devuelve `state`, `tools`, `error`, `authUrl`, `serverInfo` (nombre y versión que informa el servidor) y `connect()`, `authorize()`, `disconnect()` (cierra la sesión y conserva el inicio de sesión) y `logout()`.

`logout()` (y `remove()` en `useMCPServers`) olvida el inicio de sesión del usuario: se borran los tokens. El registro de tu app en el proveedor se conserva, así que el siguiente inicio de sesión no vuelve a registrarla.

#### Qué servidores funcionan en el navegador {#which-servers-work-in-the-browser}

En modo navegador, es el propio navegador quien llama al servidor MCP, a sus metadatos de inicio de sesión, al registro y a los endpoints de token. Eso solo funciona cuando el servidor lo permite con CORS y admite el registro dinámico de clientes y PKCE.

- Verificados con un inicio de sesión real: **Notion** y **Linear**.
- Comprobados en cuanto al acceso desde el navegador (CORS y metadatos de inicio de sesión): **Hugging Face** y **DeepWiki** (DeepWiki no requiere iniciar sesión).
- En noviembre de 2026 estos servidores no permiten el acceso desde el navegador, así que usa el modo servidor con ellos: GitHub (sin registro dinámico de clientes, sin CORS en el endpoint de token), Vercel y Stripe (sin CORS en el endpoint MCP), Asana (sin CORS en el endpoint MCP, sin registro dinámico), Atlassian (el CORS no permite la cabecera `Authorization`).

Cuando un servidor bloquea el navegador, la entrada falla con `MCPUnsupportedServerError` y un mensaje que apunta al modo servidor. `mcpServers.github` aparece en la lista como `failed` en modo navegador.

Deja que los servidores se conecten primero (`autoConnect` o `enable()`) antes de ofrecer un botón «Iniciar sesión». Así, un servidor que bloquea los navegadores muestra `failed` de inmediato, sin abrir una ventana emergente en la que el usuario inicie sesión en vano.

#### Dónde se guardan los tokens {#where-tokens-are-kept}

`storage` decide dónde se guardan los tokens, los registros de cliente y la lista:

- `'local'` (por defecto): `localStorage`; el usuario sigue con la sesión iniciada entre visitas.
- `'session'`: `sessionStorage`; la sesión se cierra al cerrar la pestaña.
- `'memory'`: no se guarda nada; la sesión se cierra al recargar.
- tu propio adaptador: `{ get(key), set(key, value), remove(key) }`, síncrono o asíncrono.

Los tokens del almacenamiento del navegador puede leerlos cualquier script de la página: un fallo de XSS en tu app los expone. Usa `'session'` o `'memory'` en configuraciones más estrictas, o el modo servidor, donde el navegador nunca recibe los tokens.

### Modo servidor {#server-mode}

`createMCPConnector` de `vue-llm/server` ejecuta el inicio de sesión y las conexiones MCP en tu backend. Los tokens se guardan en tu almacén, cifrados, y nunca llegan al navegador. Las herramientas se ejecutan en [`createLLMHandler`](./server#server-tools), y sus llamadas llegan a `useChat` en streaming como siempre. Ejemplo con Nuxt:

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

`toolsFor(request)` devuelve las herramientas de los servidores activados y conectados de ese usuario. Un servidor que falla o que necesita iniciar sesión de nuevo se omite, así que nunca rompe el chat.

En el frontend, pasa `server` en lugar de un catálogo. La lista viene del backend:

```ts
import { useChat, useMCPServers } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'

const connectors = useMCPServers({ server: '/api/mcp' })

const chat = useChat({
  provider: createProxyProvider('/api/chat'),
  onFinish: () => connectors.refresh(),
})
```

Sirve la misma plantilla. `connectors.tools` se queda vacío, porque las herramientas se ejecutan en el servidor. La lista se vuelve a cargar con `refresh()`, cuando la ventana recibe el foco y después de iniciar sesión. Llamar a `refresh()` en `onFinish` muestra justo después un servidor que se omitió durante la respuesta (por ejemplo, uno que necesita iniciar sesión de nuevo). Un servidor desactivado aparece como `idle`. Para un solo servidor, usa `useMCP({ id: 'notion', server: '/api/mcp' })`.

Si tu API usa bearer tokens en lugar de cookies, pasa `headers` (un objeto simple, un ref o un getter), y `fetch` si necesitas el tuyo. `credentials` es `'include'` por defecto.

En modo servidor no escribes una página de callback: el conector la sirve en `${publicUrl}${basePath}/callback`. La página no termina el inicio de sesión por sí misma. Entrega la respuesta del proveedor a la ventana que la abrió, y `useMCP` / `useMCPServers` la envían a `POST {server}/servers/:id/complete` con la sesión del usuario. La ventana emergente debe conservar su opener; cuando `publicUrl` está en el origen del frontend, también se envía un mensaje de `BroadcastChannel`.

| Opción | Descripción |
|--------|-------------|
| `basePath` | Dónde se monta `handler`, por ejemplo `'/api/mcp'` |
| `publicUrl` | Obligatoria. El origen absoluto de tu app. El callback del inicio de sesión es `${publicUrl}${basePath}/callback`; nunca se toma de las cabeceras de la petición. |
| `allowedOrigins` | Orígenes del frontend autorizados a llamar a las rutas (CORS con credenciales, comprobación de CSRF). Por defecto: el origen de `publicUrl` |
| `servers` | El catálogo que todo usuario puede activar: presets o `{ id, url, name?, oauth? }`. Cada uno admite `include` / `exclude` (consulta [Limitar las herramientas](#limiting-tools)) |
| `user` | Obligatoria. Devuelve el id del usuario con sesión iniciada para una petición, o `null` (las rutas responden 401) |
| `store` | Dónde se guardan los tokens, los registros y la lista de cada usuario: cualquier objeto con `get`/`set`/`remove`, síncrono o asíncrono. El `useStorage()` de Nitro y unstorage sirven tal cual. |
| `secret` | Cifra cada valor almacenado (AES-GCM). Obligatoria cuando `NODE_ENV` es `production`; en desarrollo, sin ella, los valores se guardan en texto plano y se registra una advertencia. Genera una aleatoria con `openssl rand -base64 32` y mantenla fuera de tu código (una variable de entorno). |
| `allowCustom` | Permite que los usuarios añadan servidores por URL. Por defecto `false`. Hasta 20 por usuario, URLs de hasta 2048 caracteres y nombres de hasta 100 (si no, 400); una URL que ya está en la lista del usuario recibe 409 con el `id` de ese servidor. Consulta [Notas de seguridad](#security-notes). |
| `allowHosts` | Patrones de host (`example.com`, `*.example.com`) permitidos para los servidores añadidos por los usuarios y su inicio de sesión |
| `timeout` | Plazo para conectarse a un servidor, en ms. Por defecto `10000`; un servidor más lento se omite y se muestra como error. |
| `clientName` | Se muestra en la pantalla de consentimiento del proveedor. Por defecto: el host de `publicUrl` |
| `fetch` | Se usa para todas las peticiones salientes |

#### GitHub {#github}

Se espera que GitHub funcione en modo servidor, pero aún no se ha verificado con vue-llm. El servidor MCP de GitHub no tiene registro dinámico de clientes, así que registra tú mismo una app OAuth: en GitHub, **Settings → Developer settings → OAuth Apps → New OAuth App**, con la URL de callback `${publicUrl}${basePath}/callback` (en el ejemplo anterior, `https://app.example.com/api/mcp/callback`). Después pasa sus credenciales:

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

La misma opción `oauth` sirve para cualquier servidor que exija un cliente registrado de antemano.

### Notas de seguridad {#security-notes}

- **Los servidores que añade el usuario ven lo que el modelo les envía y pueden responderle.** Un servidor que añade el usuario recibe las llamadas a herramientas que el modelo le hace, y sus descripciones y resultados de herramientas van al modelo, por lo que puede intentar una prompt injection. Muestra el host del servidor antes de que el usuario inicie sesión (como en la plantilla de arriba) y deja `allowCustom` desactivado si no lo necesitas.
- **El modo servidor obtiene URLs elegidas por los usuarios** (`allowCustom`). El conector solo acepta `https://`, rechaza siempre direcciones de loopback, privadas, link-local y de metadatos de la nube, y comprueba cada redirección. Además:
  - En producción, define `allowHosts`. Enumera los hosts de los servidores que permites *y* los hosts que usa su inicio de sesión (el servidor de autorización); si no, se rechaza su inicio de sesión.
  - Sin `allowHosts`, cada host se resuelve con `node:dns` (Node, Bun, Deno) y se rechaza si alguna dirección es privada. Esta comprobación no puede descartar el DNS rebinding: otro motivo para definir `allowHosts`.
  - En runtimes de borde sin `node:dns` (Cloudflare Workers, edge functions), `allowCustom` requiere `allowHosts`: sin él, añadir un servidor falla con un error que lo explica.
- **Los metadatos de inicio de sesión deben ser exactos.** El `issuer` de los metadatos del servidor de autorización de un proveedor debe coincidir exactamente con la URL del servidor de autorización (RFC 8414); un servidor que se equivoca en esto no permite iniciar sesión.
- En modo servidor, las rutas comprueban la cabecera `Origin` contra `allowedOrigins` (los cambios sin ella se rechazan) y exigen un `user` con sesión iniciada. Los tokens del proveedor nunca aparecen en una respuesta al navegador.
- **Un inicio de sesión queda vinculado al usuario que lo empezó.** La página de callback solo pasa la respuesta del proveedor al opener; el backend solo guarda los tokens cuando `POST /servers/:id/complete` viene del mismo `user` (y para el mismo servidor) que llamó a `authorize`. Si alguien envía su enlace de inicio de sesión a otra persona, la cuenta de esa persona no queda vinculada al usuario que lo envió.
