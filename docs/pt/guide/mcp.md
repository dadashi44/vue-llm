---
description: 'Use servidores MCP (Model Context Protocol) em Vue: transforme as ferramentas de qualquer servidor MCP em ferramentas para useChat e createLLMHandler com mcpTools.'
---

# MCP

O [MCP](https://modelcontextprotocol.io) (Model Context Protocol) é um jeito padrão de dar ferramentas a um modelo: busca, arquivos, GitHub, bancos de dados e [centenas de outras](https://github.com/modelcontextprotocol/servers). O `mcpTools` de `vue-llm/mcp` recebe um cliente MCP conectado e transforma as ferramentas do servidor dele em ferramentas comuns do vue-llm, para que o modelo possa chamá-las no `useChat` e no `createLLMHandler`.

## Instalação {#setup}

O vue-llm usa o cliente do SDK oficial e não o inclui no pacote. Instale-o junto com o vue-llm:

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
