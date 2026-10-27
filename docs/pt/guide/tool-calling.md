---
description: 'Chamada de ferramentas e funções de LLM em Vue: defineTool com execute, onToolCall, estados das chamadas e human-in-the-loop com addToolResult.'
---

# Chamada de ferramentas

Declare ferramentas com parâmetros em JSON Schema. Uma ferramenta com `execute` roda automaticamente, o valor retornado volta para o modelo e a conversa continua.

```ts
import { defineTool, useChat } from 'vue-llm'

const getWeather = defineTool<{ city: string }, { temp: number }>({
  name: 'get_weather',
  description: 'Get the current weather for a city',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
  execute: ({ city }, { signal }) => fetch(`/api/weather?city=${city}`, { signal }).then(r => r.json()),
})

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: [getWeather],
  maxToolRoundtrips: 3,
})
```

`defineTool` só adiciona tipos. `execute` recebe os argumentos já parseados e um `signal` que é abortado quando o chat é parado. Se ele lançar um erro, a mensagem de erro é enviada ao modelo para que ele possa se recuperar.

## onToolCall

Ferramentas sem `execute` vão para o `onToolCall`, um único handler para todas as ferramentas:

```ts
useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: [{ name: 'get_weather', description: '…', parameters: { /* … */ } }],
  async onToolCall({ toolName, args }) {
    if (toolName === 'get_weather') return fetchWeather(args as { city: string })
  },
})
```

## Ciclo de vida {#lifecycle}

Cada chamada aparece como uma parte `tool-call` na mensagem do assistente:

| `state` | Significado |
|---------|---------|
| `streaming` | Os argumentos estão chegando. `args` contém o que já foi parseado. |
| `pending` | Os argumentos estão completos e a chamada aguarda um resultado |
| `running` | `execute` / `onToolCall` está em execução |
| `result` | `result` contém o valor retornado |
| `error` | A ferramenta lançou um erro; `error` contém a mensagem |

## Human-in-the-loop {#human-in-the-loop}

Uma chamada que não recebe resultado (sem `execute`, e com `onToolCall` ausente ou retornando `undefined`) **pausa** o chat em `pending`. Resolva-a pela sua UI com `addToolResult`. Quando não sobra nenhuma chamada pendente, o chat envia os resultados e continua:

```ts
await addToolResult({ toolCallId, result: { approved: true } })
await addToolResult({ toolCallId, error: 'The user declined' })
```

Defina `autoSendToolResults: false` para apenas registrar o resultado. Se, em vez disso, o usuário enviar uma nova mensagem, as chamadas sem resposta são informadas ao modelo como não respondidas.

Para renderizar essas chamadas como componentes, veja [Generative UI](./generative-ui).

`maxToolRoundtrips` (padrão `5`) limita quantas vezes o modelo pode chamar ferramentas em resposta a uma mensagem.

## Ferramentas no servidor {#server-side-tools}

Ferramentas que precisam de segredos ou de acesso ao banco de dados devem rodar no servidor. Com o [`createLLMHandler`](./server#server-tools), adicione `execute` à ferramenta; com o seu próprio backend, emita chunks `tool-result` via [`createSSEProvider`](./custom-backends#server-side-tool-results). Em ambos os casos, o `state` da parte vira `result` e o cliente não faz nenhuma requisição extra.
