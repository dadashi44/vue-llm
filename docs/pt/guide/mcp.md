---
description: 'Use servidores MCP (Model Context Protocol) em Vue: transforme as ferramentas de qualquer servidor MCP em ferramentas para useChat e createLLMHandler com mcpTools, e deixe os usuários conectarem os próprios servidores com useMCP e useMCPServers.'
---

# MCP

O [MCP](https://modelcontextprotocol.io) (Model Context Protocol) é um jeito padrão de dar ferramentas a um modelo: busca, arquivos, GitHub, bancos de dados e [centenas de outras](https://github.com/modelcontextprotocol/servers). O `mcpTools` de `vue-llm/mcp` recebe um cliente MCP conectado e transforma as ferramentas do servidor dele em ferramentas comuns do vue-llm, para que o modelo possa chamá-las no `useChat` e no `createLLMHandler`. Para deixar cada usuário conectar os próprios servidores (Notion, Linear…) pelo chat, veja [Deixe os usuários conectarem os próprios servidores](#let-users-connect-their-own-servers).

## Instalação {#setup}

O `mcpTools` usa o cliente do SDK oficial, e o vue-llm não o inclui no pacote. Instale-o junto com o vue-llm (`useMCP` e `useMCPServers` não precisam dele):

```bash
npm i @modelcontextprotocol/sdk
```

## No servidor {#on-the-server}

Rode o MCP no servidor quando o servidor MCP precisar de uma chave de API ou rodar localmente (stdio). O handler chama as ferramentas por conta própria e envia os resultados ao navegador via streaming:

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

Para um servidor MCP local, conecte via stdio:

```ts
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

await client.connect(new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', './docs'],
}))
```

No cliente nada muda: o `useChat` com [`createProxyProvider`](./server) mostra cada chamada MCP como uma parte `tool-call` com o seu resultado, e o [`MessageParts`](./components#messageparts) e o [DevTools](./devtools) a exibem como qualquer outra ferramenta.

## No navegador {#in-the-browser}

Um servidor MCP público que não precisa de segredos pode ser usado direto do `useChat`. O servidor precisa liberar a sua origem via CORS e expor o header `Mcp-Session-Id`.

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

O `useChat` executa as chamadas, envia os resultados ao modelo e continua, como com qualquer [ferramenta com `execute`](./tool-calling). Parar o chat aborta a chamada MCP em andamento.

## Opções {#options}

```ts
await mcpTools(client, {
  include: ['search', 'fetch'], // only these tools
  exclude: ['delete_file'],     // or everything except these
  prefix: 'github',             // github_search, github_fetch…
})
```

| Opção | Descrição |
|--------|-------------|
| `include` | Apenas estas ferramentas, pelo nome delas no servidor MCP |
| `exclude` | Deixa estas ferramentas de fora |
| `prefix` | Adicionado antes de cada nome como `prefix_name`. Use quando combinar ferramentas de vários servidores. |
| `signal` | Cancela a listagem das ferramentas |

Ferramentas de vários servidores podem ser combinadas em uma única lista:

```ts
tools: [
  ...await mcpTools(github, { prefix: 'github' }),
  ...await mcpTools(docs, { prefix: 'docs' }),
  getWeather,
]
```

## Resultados {#results}

- Se a ferramenta retornar `structuredContent`, o modelo recebe esse objeto.
- Se retornar só texto, o modelo recebe o texto.
- Outros conteúdos (imagens, recursos) são repassados como o array de content do MCP.
- Se a ferramenta reportar um erro (`isError`), a chamada termina no estado `error` com a mensagem da ferramenta, e o modelo pode se recuperar.

Caracteres que os provedores não aceitam em nomes de ferramentas (qualquer coisa além de letras, dígitos, `_` e `-`) são substituídos por `_`. O servidor MCP é sempre chamado com o nome original.

## Segurança {#security}

As ferramentas de um servidor MCP rodam com o acesso que você der a esse servidor. Antes de conectar um:

- Conecte apenas servidores em que você confia. Descrições e resultados das ferramentas vão para o modelo e podem conter instruções direcionadas a ele (prompt injection).
- Use `include` para expor só as ferramentas de que o chat precisa, principalmente quando o servidor pode escrever ou apagar dados.
- Mantenha os tokens dos servidores MCP no servidor. Tudo o que é passado ao cliente no navegador fica visível para os usuários.

## Deixe os usuários conectarem os próprios servidores {#let-users-connect-their-own-servers}

O `mcpTools` conecta os servidores que você escolhe, com as suas credenciais. `useMCP` e `useMCPServers` deixam cada pessoa que usa o seu chat conectar os *próprios* servidores MCP — o Notion dela, o Linear dela — do jeito que Claude e ChatGPT permitem adicionar conectores. O usuário clica em "Conectar", entra na conta do provedor em um popup e o chat ganha as ferramentas desse servidor. O vue-llm tem um cliente MCP próprio para isso, então você não precisa do `@modelcontextprotocol/sdk`.

### Dois modos {#two-modes}

A API do frontend é a mesma nos dois; você escolhe o modo para o app inteiro.

| | Modo navegador | Modo servidor |
|---|---|---|
| Como ativar | `useMCPServers({ catalog })` | `useMCPServers({ server: '/api/mcp' })` + `createMCPConnector` no backend |
| Quem fala com o servidor MCP | o navegador do usuário | o seu backend |
| Tokens do usuário | armazenamento do navegador (`localStorage` por padrão) | o seu armazenamento (banco de dados, KV), criptografados |
| Exposto a XSS no seu app | sim | não — o navegador nunca vê os tokens do provedor |
| Precisa de backend | não | sim (um chat geralmente já tem um, para a chave de API do modelo) |
| Servidores que funcionam | aqueles cujo login e CORS funcionam a partir de um navegador: verificado com Notion e Linear; Hugging Face e DeepWiki checados quanto ao acesso pelo navegador | servidores Streamable HTTP cujo login pode ser feito em um backend: verificado manualmente via `createMCPConnector` com Notion e DeepWiki (novembro de 2026). O GitHub exige o seu próprio app OAuth e deve funcionar, mas ainda não foi verificado |
| Onde as ferramentas rodam | `useChat` no navegador | `createLLMHandler` no servidor |

Use o modo servidor em produção. O modo navegador é o começo rápido quando você não tem backend.

### Modo navegador {#browser-mode}

#### A página de callback {#the-callback-page}

Depois do login, o provedor redireciona o popup para uma página do seu app, por padrão `/mcp/callback`. Essa página chama `handleMCPCallback()`, que entrega o resultado à janela do chat e fecha o popup. Com Vue Router:

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

Qualquer página na mesma origem serve, por exemplo um `public/mcp/callback.html` estático:

```html
<script type="module">
  import { handleMCPCallback } from 'https://cdn.jsdelivr.net/npm/vue-llm@1/dist/mcp.js'
  handleMCPCallback()
</script>
```

Use `callbackUrl` para escolher outro caminho e mantenha-o estável: o provedor o memoriza quando o seu app se registra.

#### Vários servidores: `useMCPServers` {#several-servers-usemcpservers}

`useMCPServers` mantém uma lista de servidores: um catálogo que você define, que o usuário liga e desliga, e, com `allowCustom`, servidores que o usuário adiciona por URL. O `mcpServers` de `vue-llm/mcp` tem presets para Notion, Linear, Hugging Face, DeepWiki e GitHub (veja [quais servidores funcionam no navegador](#which-servers-work-in-the-browser)).

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

`tools` contém as ferramentas de todos os servidores ligados que estão `ready`. O nome de cada ferramenta começa com o id do seu servidor (`notion_search`, `linear_create_issue`), então os servidores nunca colidem. O `useChat` lê a lista antes de cada requisição, de modo que as ferramentas aparecem assim que um servidor conecta.

Renderize a lista como quiser:

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

| Método | O que faz |
|--------|-------------|
| `enable(id)` | Liga um servidor e conecta com as credenciais salvas. Nunca abre um popup: se for preciso entrar, o estado passa a `needs-auth`. |
| `authorize(id)` | Abre o popup de login (e liga o servidor). Chame-o a partir de um clique: os navegadores bloqueiam popups abertos depois. |
| `disable(id)` | Desliga um servidor e mantém o login. |
| `add({ url, name? })` | Adiciona um servidor por URL (exige `allowCustom`) e devolve o id dele, criado a partir do host (`mcp.example.com` → `example`). Somente `https://`, e `http://localhost` para desenvolvimento. Uma URL inválida não lança erro: a entrada aparece como `failed` com o motivo. Uma URL que já está na lista devolve o id desse servidor em vez de adicioná-lo duas vezes. No máximo 20 servidores adicionados, URLs de até 2048 caracteres e nomes de até 100. |
| `remove(id)` | Esquece um servidor adicionado pelo usuário, junto com os tokens. Servidores do catálogo só podem ser desligados. |
| `refresh()` | Reconecta todos os servidores ligados. |

Cada item de `list` tem `id`, `name`, `url`, `custom`, `enabled`, `state`, `error`, `authUrl` e `tools`. Quais servidores estão ligados e quais o usuário adicionou ficam salvos no mesmo armazenamento dos tokens.

Os estados são `idle` (desligado), `connecting`, `needs-auth`, `authorizing` (o popup está aberto), `ready` e `failed`. Se o navegador bloqueou o popup, o estado continua `authorizing` e `authUrl` traz a URL de login: mostre-a como um link, como acima.

Opções: `catalog`, `allowCustom` (padrão `false`), `callbackUrl`, `clientName` (exibido na tela de consentimento do provedor; padrão `document.title`) e `storage`.

#### Limitar as ferramentas {#limiting-tools}

Todas as ferramentas de todos os servidores ligados vão para o modelo, com a descrição e o schema de entrada. Notion (77 ferramentas) e Linear (70) juntos já passam do limite de 128 ferramentas por requisição da OpenAI, e cada schema consome tokens do prompt a cada turno. Dê a uma entrada do catálogo `include` (somente estas ferramentas) ou `exclude` (tudo, exceto estas), pelos nomes das ferramentas no servidor MCP:

```ts
const connectors = useMCPServers({
  catalog: [
    { ...mcpServers.notion, include: ['notion-search', 'notion-fetch'] },
    { id: 'docs', url: 'https://mcp.example.com/mcp', exclude: ['delete_page'] },
  ],
})
```

No modo servidor, defina-os da mesma forma em `servers` do conector; o catálogo do frontend não filtra nada lá. Os servidores que o usuário adiciona recebem todas as suas ferramentas.

#### Um servidor: `useMCP` {#one-server-usemcp}

Para um único servidor, `useMCP` dá o mesmo estado diretamente:

```ts
import { useMCP } from 'vue-llm'

const notion = useMCP({ url: 'https://mcp.notion.com/mcp', prefix: 'notion' })

useChat({ provider: ai, model: 'gpt-4o', tools: () => notion.tools.value })
```

```vue
<button v-if="notion.state.value === 'needs-auth'" @click="notion.authorize()">Connect Notion</button>
```

| Opção | Descrição |
|--------|-------------|
| `url` | O endpoint Streamable HTTP do servidor |
| `prefix`, `include`, `exclude` | Como em [`mcpTools`](#options) |
| `autoConnect` | Conecta ao montar, com as credenciais salvas. Padrão `true`. Nunca abre um popup. |
| `callbackUrl` | Padrão `${location.origin}/mcp/callback` |
| `clientName` | Exibido na tela de consentimento do provedor. Padrão `document.title` |
| `storage` | `'local'` (padrão), `'session'`, `'memory'` ou o seu próprio adaptador |

Ele devolve `state`, `tools`, `error`, `authUrl`, `serverInfo` (nome e versão informados pelo servidor) e `connect()`, `authorize()`, `disconnect()` (fecha a sessão e mantém o login) e `logout()`.

`logout()` (e `remove()` em `useMCPServers`) esquece o login do usuário: os tokens são apagados. O registro do seu app no provedor é mantido, então o próximo login não precisa registrar de novo.

#### Quais servidores funcionam no navegador {#which-servers-work-in-the-browser}

No modo navegador, é o próprio navegador que chama o servidor MCP, os metadados de login, o registro e os endpoints de token dele. Isso só funciona quando o servidor permite via CORS e oferece suporte a registro dinâmico de cliente e PKCE.

- Verificados com um login real: **Notion** e **Linear**.
- Checados quanto ao acesso pelo navegador (CORS e metadados de login): **Hugging Face** e **DeepWiki** (o DeepWiki não exige login).
- Em novembro de 2026, estes servidores não permitem acesso pelo navegador; use o modo servidor para eles: GitHub (sem registro dinâmico de cliente, sem CORS no endpoint de token), Vercel e Stripe (sem CORS no endpoint MCP), Asana (sem CORS no endpoint MCP, sem registro dinâmico), Atlassian (o CORS não permite o cabeçalho `Authorization`).

Quando um servidor bloqueia o navegador, a entrada falha com `MCPUnsupportedServerError` e uma mensagem que aponta para o modo servidor. No modo navegador, `mcpServers.github` aparece na lista como `failed`.

Deixe os servidores conectarem primeiro (`autoConnect` ou `enable()`) antes de oferecer um botão "Entrar". Assim, um servidor que bloqueia navegadores aparece como `failed` na hora, sem abrir um popup em que o usuário entraria à toa.

#### Onde os tokens ficam {#where-tokens-are-kept}

`storage` decide onde ficam os tokens, os registros de cliente e a lista:

- `'local'` (padrão) — `localStorage`; o usuário continua conectado entre as visitas.
- `'session'` — `sessionStorage`; a sessão acaba quando a aba é fechada.
- `'memory'` — nada é salvo; a sessão acaba ao recarregar.
- o seu próprio adaptador: `{ get(key), set(key, value), remove(key) }`, síncrono ou assíncrono.

Os tokens no armazenamento do navegador podem ser lidos por qualquer script da página: uma falha de XSS no seu app os expõe. Use `'session'` ou `'memory'` em configurações mais rígidas, ou o modo servidor, em que o navegador nunca recebe os tokens.

### Modo servidor {#server-mode}

O `createMCPConnector` de `vue-llm/server` faz o login e as conexões MCP no seu backend. Os tokens ficam no seu armazenamento, criptografados, e nunca chegam ao navegador. As ferramentas rodam no [`createLLMHandler`](./server#server-tools), e as chamadas delas chegam ao `useChat` por streaming, como de costume. Exemplo com Nuxt:

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

`toolsFor(request)` devolve as ferramentas dos servidores ligados e conectados daquele usuário. Um servidor que falha ou precisa de um novo login é ignorado, então nunca quebra o chat.

No frontend, passe `server` em vez de um catálogo. A lista vem do backend:

```ts
import { useChat, useMCPServers } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'

const connectors = useMCPServers({ server: '/api/mcp' })

const chat = useChat({
  provider: createProxyProvider('/api/chat'),
  onFinish: () => connectors.refresh(),
})
```

O mesmo template funciona. `connectors.tools` fica vazio, porque as ferramentas rodam no servidor. A lista é carregada de novo em `refresh()`, quando a janela recebe foco e depois de um login. Chamar `refresh()` em `onFinish` mostra logo em seguida um servidor que foi ignorado durante a resposta (por exemplo, um que precisa de novo login). Um servidor desligado aparece como `idle`. Para um único servidor, use `useMCP({ id: 'notion', server: '/api/mcp' })`.

Se a sua API usa bearer tokens em vez de cookies, passe `headers` (um objeto simples, ref ou getter) e `fetch`, se precisar do seu próprio. `credentials` é `'include'` por padrão.

No modo servidor você não escreve uma página de callback: o conector a serve em `${publicUrl}${basePath}/callback`. A página não conclui o login sozinha. Ela entrega a resposta do provedor à janela que a abriu, e `useMCP` / `useMCPServers` a enviam para `POST {server}/servers/:id/complete` com a sessão do usuário. O popup precisa manter o seu opener; quando `publicUrl` está na origem do frontend, uma mensagem de `BroadcastChannel` também é enviada.

| Opção | Descrição |
|--------|-------------|
| `basePath` | Onde o `handler` é montado, por exemplo `'/api/mcp'` |
| `publicUrl` | Obrigatória. A origem absoluta do seu app. O callback do login é `${publicUrl}${basePath}/callback`; ele nunca é tirado dos cabeçalhos da requisição. |
| `allowedOrigins` | Origens do frontend autorizadas a chamar as rotas (CORS com credenciais, verificação de CSRF). Padrão: a origem de `publicUrl` |
| `servers` | O catálogo que todo usuário pode ligar: presets ou `{ id, url, name?, oauth? }`. Cada um aceita `include` / `exclude` (veja [Limitar as ferramentas](#limiting-tools)) |
| `user` | Obrigatória. Devolve o id do usuário logado para uma requisição, ou `null` (as rotas respondem 401) |
| `store` | Onde ficam os tokens, os registros e a lista de cada usuário: qualquer objeto com `get`/`set`/`remove`, síncrono ou assíncrono. O `useStorage()` do Nitro e o unstorage servem como estão. |
| `secret` | Criptografa todo valor armazenado (AES-GCM). Obrigatória quando `NODE_ENV` é `production`; em desenvolvimento, sem ela, os valores são guardados em texto puro e um aviso é registrado. Gere uma aleatória com `openssl rand -base64 32` e mantenha-a fora do código (uma variável de ambiente). |
| `allowCustom` | Permite que os usuários adicionem servidores por URL. Padrão `false`. Até 20 por usuário, URLs de até 2048 caracteres e nomes de até 100 (senão, 400); uma URL que já está na lista do usuário recebe 409 com o `id` desse servidor. Veja [Notas de segurança](#security-notes). |
| `allowHosts` | Padrões de host (`example.com`, `*.example.com`) permitidos para servidores adicionados pelos usuários e para o login deles |
| `timeout` | Prazo para conectar a um servidor, em ms. Padrão `10000`; um servidor mais lento é ignorado e aparece como erro. |
| `clientName` | Exibido na tela de consentimento do provedor. Padrão: o host de `publicUrl` |
| `fetch` | Usado em todas as requisições de saída |

#### GitHub {#github}

O GitHub no modo servidor deve funcionar, mas ainda não foi verificado com o vue-llm. O servidor MCP do GitHub não tem registro dinâmico de cliente, então registre você mesmo um app OAuth: no GitHub, **Settings → Developer settings → OAuth Apps → New OAuth App**, com a URL de callback `${publicUrl}${basePath}/callback` (no exemplo acima, `https://app.example.com/api/mcp/callback`). Depois passe as credenciais dele:

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

A mesma opção `oauth` serve para qualquer servidor que exija um cliente pré-registrado.

### Notas de segurança {#security-notes}

- **Servidores adicionados pelo usuário veem o que o modelo envia a eles e podem responder ao modelo.** Um servidor que o usuário adiciona recebe as chamadas de ferramenta que o modelo faz a ele, e as descrições e os resultados das ferramentas dele vão para o modelo, então ele pode tentar prompt injection. Mostre o host do servidor antes de o usuário entrar (como no template acima) e mantenha `allowCustom` desligado se não precisar dele.
- **O modo servidor busca URLs escolhidas pelos usuários** (`allowCustom`). O conector só aceita `https://`, sempre recusa endereços de loopback, privados, link-local e de metadados de nuvem, e verifica cada redirecionamento. Além disso:
  - Em produção, defina `allowHosts`. Liste os hosts dos servidores que você permite *e* os hosts que o login deles usa (o servidor de autorização); senão o login deles é recusado.
  - Sem `allowHosts`, cada host é resolvido com `node:dns` (Node, Bun, Deno) e recusado se algum endereço for privado. Essa verificação não descarta DNS rebinding — mais um motivo para definir `allowHosts`.
  - Em runtimes de borda sem `node:dns` (Cloudflare Workers, edge functions), `allowCustom` exige `allowHosts`: sem ele, adicionar um servidor falha com um erro que explica isso.
- **Os metadados de login precisam ser exatos.** O `issuer` nos metadados do servidor de autorização de um provedor deve ser idêntico à URL do servidor de autorização (RFC 8414); um servidor que erra nisso não permite login.
- No modo servidor, as rotas conferem o cabeçalho `Origin` com `allowedOrigins` (alterações sem ele são recusadas) e exigem um `user` logado. Os tokens do provedor nunca aparecem em uma resposta ao navegador.
- **Um login fica vinculado ao usuário que o iniciou.** A página de callback só repassa a resposta do provedor ao opener; o backend só salva os tokens quando `POST /servers/:id/complete` vem do mesmo `user` (e para o mesmo servidor) que chamou `authorize`. Se alguém enviar o link de login a outra pessoa, a conta dela não é vinculada ao usuário de quem enviou.
