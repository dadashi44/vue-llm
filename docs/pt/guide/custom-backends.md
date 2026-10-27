---
description: 'Conecte o useChat a um backend existente que faz streaming de Server-Sent Events com createSSEProvider, mapeando o seu formato de eventos para chunks do vue-llm.'
---

# Backends próprios

Muitos apps já têm um backend que conversa com o LLM: ele guarda sessões, injeta contexto de negócio e roda ferramentas no seu banco de dados. O `createSSEProvider` conecta o `useChat` a esse backend sem mudar o protocolo dele.

## createSSEProvider

```ts
import { useChat } from 'vue-llm'
import { createSSEProvider } from 'vue-llm/providers'

const provider = createSSEProvider({
  url: req => `/api/ai-chat/sessions/${(req.providerOptions as { sessionId: string }).sessionId}/stream`,
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  body: req => ({ message: req.messages.at(-1)?.content }), // session backends only need the new message
  mapEvent: ({ event, json }) => {
    const d = json as any
    switch (event) {
      case 'thinking': return { type: 'reasoning-delta', text: d.text }
      case 'text_delta': return { type: 'text-delta', text: d.text }
      case 'tool_use': return [
        { type: 'tool-call-start', toolCallId: d.id, toolName: d.name },
        { type: 'tool-call-delta', toolCallId: d.id, args: JSON.stringify(d.input) },
        { type: 'tool-call-end', toolCallId: d.id },
      ]
      case 'tool_result': return { type: 'tool-result', toolCallId: d.tool_use_id, result: d.output }
      case 'error': return { type: 'error', error: new Error(d.message) }
      case 'done': return { type: 'finish', finishReason: 'stop' }
    }
  },
})

const sessionId = ref('s1')
const { messages, sendMessage } = useChat({ provider, model: 'default', body: () => ({ sessionId: sessionId.value }) })
```

| Opção | Tipo | Descrição |
|--------|------|-------------|
| `url` | `string \| (request) => string` | Endpoint; pode depender da requisição (`providerOptions` carrega o `body` do `useChat`) |
| `method` | `string` | Padrão `POST` |
| `headers` | `HeadersInit \| () => HeadersInit \| Promise<HeadersInit>` | Estáticos ou por requisição (por exemplo, tokens de auth renovados) |
| `credentials` | `RequestCredentials` | Por exemplo, `'include'` para auth via cookie |
| `body` | `(request) => unknown` | JSON da requisição. Padrão `{ messages, model }` |
| `mapEvent` | `({ event, data, json, id }) => chunk \| chunk[] \| null` | Traduz um evento SSE. Padrão: os dados já são um chunk do vue-llm |
| `id` / `name` | `string` | Usados em `LLMAPIError.provider` e nas mensagens de erro |

- `json` é o `event.data` parseado como JSON (ou `undefined`); `data: [DONE]` é ignorado.
- Retorne `null`/`undefined` para pular um evento, ou um array para emitir vários chunks.
- Se o stream terminar sem um chunk `finish`, um é adicionado.
- Respostas fora da faixa 2xx lançam [`LLMAPIError`](./retries-rate-limiting#errors), então o `retryMiddleware` também funciona aqui.

## Resultados de ferramentas no servidor {#server-side-tool-results}

Quando o backend executa as ferramentas por conta própria, emita um chunk `tool-result` depois da chamada:

```ts
{ type: 'tool-result', toolCallId: 't1', result: { leader: 'Team A' } }
{ type: 'tool-result', toolCallId: 't1', error: 'Database unavailable' }
```

A parte `tool-call` correspondente passa para `result` (ou `error`), e o `useChat` **não** inicia uma ida e volta pelo cliente para ela. Mostre o progresso a partir do `state` da parte: `pending` → (`running`) → `result` / `error`.

::: tip
O `tool-call-end` chega antes do `tool-result`, então um handler `onToolCall` também vê as chamadas do servidor. Retorne `undefined` para as ferramentas que o cliente não trata — o resultado do servidor vai preenchê-las.
:::

## Com vue-llm no servidor {#with-vue-llm-on-the-server}

Se o seu backend é JavaScript, o `createLLMHandler` pode executar as ferramentas para você — veja [Ferramentas no servidor](./server#server-tools). O stream dele já fala o protocolo do vue-llm, então o cliente só precisa do `createProxyProvider`.
