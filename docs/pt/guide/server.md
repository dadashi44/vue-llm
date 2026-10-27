---
description: 'createLLMHandler: um handler Request/Response baseado em Web standards que faz proxy das chamadas ao LLM, roda ferramentas no servidor e aplica rate limit por IP. Funciona em Nuxt, Node, Bun, Deno e runtimes edge.'
---

# Servidor e proxy

O `vue-llm/server` transforma qualquer provedor em um endpoint HTTP com streaming e dá ao navegador um provedor que conversa com ele — as API keys nunca saem do servidor.

## createLLMHandler

Retorna um handler `(request: Request) => Promise<Response>` baseado em Web standards, então ele roda no Node (pelo seu framework), Bun, Deno, Cloudflare Workers e Nuxt/Nitro.

```ts
import { createLLMHandler } from 'vue-llm/server'
import { createAnthropic } from 'vue-llm/providers'

const handler = createLLMHandler({
  provider: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  model: 'claude-sonnet-4-5',
  system: 'You are a helpful assistant.',
  maxMessages: 50,
  rateLimit: { maxRequests: 30, interval: 60_000 },
  onRequest: body => ({ ...body, model: 'claude-sonnet-4-5' }), // pin the model
})

// Bun
Bun.serve({ port: 3000, fetch: req => new URL(req.url).pathname === '/api/chat' ? handler(req) : new Response('Not found', { status: 404 }) })
```

| Opção | Tipo | Descrição |
|--------|------|-------------|
| `provider` | `LLMProvider` | Obrigatório |
| `model` | `string` | Modelo padrão (o corpo da requisição pode sobrescrever) |
| `system` | `string` | System prompt padrão (o corpo da requisição pode sobrescrever) |
| `tools` | `ServerToolDefinition[]` | Ferramentas oferecidas ao modelo; as que têm `execute` rodam no servidor |
| `maxToolRoundtrips` | `number` | Máximo de rodadas de ferramentas no servidor por requisição (padrão `5`) |
| `maxMessages` | `number` | Mantém só as últimas N mensagens |
| `rateLimit` | `{ maxRequests, interval?, key? }` | Limite por cliente, responde `429` + `Retry-After` |
| `onRequest` | `(body) => body` | Valida ou reescreve o corpo da requisição |

O corpo da requisição é `{ messages: ChatMessage[], model?: string, system?: string }`. As respostas são Server-Sent Events, um `ChatStreamChunk` por evento, terminando com `data: [DONE]`. Erros antes do streaming retornam JSON com status `400`, `405`, `429` ou `500`.

## Ferramentas no servidor {#server-tools}

Dê a uma ferramenta uma função `execute` e o handler a roda no servidor, devolve o resultado ao modelo e continua o streaming — o navegador nunca vê seu banco de dados nem suas API keys:

```ts
const handler = createLLMHandler({
  provider,
  tools: [
    {
      name: 'get_standings',
      description: 'Current standings of a tournament',
      parameters: { type: 'object', properties: { tournament: { type: 'number' } }, required: ['tournament'] },
      async execute(args, { request }) {
        const { tournament } = args as { tournament: number }
        await assertCanRead(request, tournament)
        return db.standings(tournament)
      },
    },
  ],
})
```

O cliente recebe a chamada da ferramenta seguida de um chunk `tool-result`, então a parte `tool-call` vai direto para `result`, sem ida e volta pelo cliente. Um erro lançado vira `{ type: 'tool-result', error }` e também é informado ao modelo, que pode se recuperar ou explicar o que houve.

Ferramentas sem `execute` ficam para o cliente: o stream termina com `finishReason: 'tool-calls'` e o `useChat` roda o `onToolCall` normalmente. Ferramentas de servidor e de cliente podem ser misturadas na mesma requisição.

## createProxyProvider

```ts
import { useChat } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'

const { messages, sendMessage } = useChat({
  provider: createProxyProvider('/api/chat'),
  model: 'claude-sonnet-4-5',
})
```

Anexos, chamadas de ferramentas, resultados de ferramentas do servidor e raciocínio passam pelo proxy sem alterações. Ele é um wrapper fino em torno do [`createSSEProvider`](./custom-backends). Respostas fora da faixa 2xx viram `LLMAPIError`s com `provider: 'proxy'`.

## streamToSSE

Helper de mais baixo nível, caso você monte a resposta por conta própria:

```ts
import { streamToSSE } from 'vue-llm/server'

const { stream } = await provider.chat({ model, messages })
return new Response(streamToSSE(stream), { headers: { 'Content-Type': 'text/event-stream' } })
```
