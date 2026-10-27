---
description: 'Llamadas a herramientas y funciones de LLM en Vue: defineTool con execute, onToolCall, estados de las llamadas e intervención humana con addToolResult.'
---

# Llamadas a herramientas

Declara herramientas con parámetros en JSON Schema. Una herramienta con `execute` se ejecuta automáticamente, su valor de retorno vuelve al modelo y la conversación continúa.

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

`defineTool` solo añade tipos. `execute` recibe los argumentos ya parseados y un `signal` que se cancela cuando se detiene el chat. Si lanza un error, el mensaje se envía al modelo para que pueda recuperarse.

## onToolCall

Las herramientas sin `execute` van a `onToolCall`, un único manejador para todas las herramientas:

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

Cada llamada aparece como una parte `tool-call` en el mensaje del asistente:

| `state` | Significado |
|---------|---------|
| `streaming` | Están llegando los argumentos. `args` contiene lo que se ha parseado hasta ahora. |
| `pending` | Los argumentos están completos y la llamada espera un resultado |
| `running` | `execute` / `onToolCall` está en curso |
| `result` | `result` contiene el valor de retorno |
| `error` | La herramienta lanzó un error; `error` contiene el mensaje |

## Intervención humana {#human-in-the-loop}

Una llamada que no recibe resultado (sin `execute`, y con `onToolCall` ausente o devolviendo `undefined`) **pausa** el chat en `pending`. Resuélvela desde tu UI con `addToolResult`. Cuando no queda ninguna llamada pendiente, el chat envía los resultados y continúa:

```ts
await addToolResult({ toolCallId, result: { approved: true } })
await addToolResult({ toolCallId, error: 'The user declined' })
```

Usa `autoSendToolResults: false` para limitarte a registrar el resultado. Si el usuario envía un mensaje nuevo en su lugar, las llamadas sin respuesta se comunican al modelo como no respondidas.

Para renderizar estas llamadas como componentes, consulta [Generative UI](./generative-ui).

`maxToolRoundtrips` (por defecto `5`) limita cuántas veces puede llamar el modelo a herramientas en respuesta a un mismo mensaje.

## Herramientas en el servidor {#server-side-tools}

Las herramientas que necesitan secretos o acceso a la base de datos deberían ejecutarse en el servidor. Con [`createLLMHandler`](./server#server-tools), añade `execute` a la herramienta; con tu propio backend, emite chunks `tool-result` mediante [`createSSEProvider`](./custom-backends#server-side-tool-results). En ambos casos, el `state` de la parte pasa a `result` y el cliente no hace ninguna petición extra.
