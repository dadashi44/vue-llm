---
description: 'Renderize chamadas de ferramentas de LLM como componentes Vue. Faça streaming dos argumentos para a UI, rode ferramentas no cliente e peça ao usuário para confirmar ações (human-in-the-loop).'
---

# Generative UI

O modelo responde com **componentes**, além de texto. Quando ele chama uma ferramenta, o `<MessageParts>` renderiza o componente que você associou a ela. O componente recebe os argumentos enquanto chegam via streaming e, depois, o resultado. Ele também pode pedir uma decisão ao usuário antes de a conversa continuar.

<ClientOnly>
  <GenerativeUIDemo />
</ClientOnly>

A demo usa um modelo roteirizado, então roda na hora e sem rede. O código abaixo é o mesmo que você usaria com um provedor real.

## 1. Defina as ferramentas {#_1-define-tools}

```ts
import { defineTool } from 'vue-llm'

export const getWeather = defineTool<{ city: string; days: number }, Weather>({
  name: 'get_weather',
  description: 'Current weather and forecast for a city',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' }, days: { type: 'number' } },
    required: ['city'],
  },
  execute: ({ city, days }, { signal }) =>
    fetch(`/api/weather?city=${city}&days=${days}`, { signal }).then(r => r.json()),
})

// No execute: the call waits until the user answers in the UI
export const confirmBooking = defineTool<Booking, Booking & { confirmed: boolean }>({
  name: 'confirm_booking',
  description: 'Ask the user to confirm a restaurant booking',
  parameters: { /* … */ },
})
```

## 2. Crie um componente por ferramenta {#_2-write-a-component-per-tool}

Os componentes de ferramenta recebem `ToolComponentProps<Args, Result>`:

| Prop | Descrição |
|------|-------------|
| `args` | Argumentos, **parciais enquanto `state` é `'streaming'`** |
| `state` | `streaming` → `pending` → `running` → `result` / `error` |
| `result` | O valor retornado pela ferramenta |
| `error` | Mensagem de erro, se a ferramenta lançou um erro |
| `addResult(result)` | Resolve a chamada pela UI |
| `toolCallId`, `toolName` | Identificadores |

```vue
<!-- WeatherCard.vue -->
<script setup lang="ts">
import type { ToolComponentProps } from 'vue-llm'

const props = defineProps<ToolComponentProps<{ city: string; days: number }, Weather>>()
</script>

<template>
  <div class="card">
    <h3>{{ props.args?.city ?? '…' }}</h3>
    <Forecast v-if="props.result" :weather="props.result" />
    <Skeleton v-else />
  </div>
</template>
```

```vue
<!-- BookingCard.vue: human in the loop -->
<script setup lang="ts">
import type { ToolComponentProps } from 'vue-llm'

const props = defineProps<ToolComponentProps<Booking, Booking & { confirmed: boolean }>>()
const decide = (confirmed: boolean) => props.addResult({ ...props.args as Booking, confirmed })
</script>

<template>
  <div class="card">
    {{ props.args?.restaurant }} at {{ props.args?.time }}
    <template v-if="props.state === 'pending'">
      <button @click="decide(true)">Confirm</button>
      <button @click="decide(false)">Cancel</button>
    </template>
  </div>
</template>
```

## 3. Renderize as mensagens {#_3-render-messages}

```vue
<script setup lang="ts">
import { useChat } from 'vue-llm'
import { MessageParts } from 'vue-llm/components'
import 'vue-llm/style.css'

const { messages, input, handleSubmit, addToolResult } = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: [getWeather, confirmBooking],
})

const components = { get_weather: WeatherCard, confirm_booking: BookingCard }
</script>

<template>
  <MessageParts
    v-for="message in messages"
    :key="message.id"
    :message="message"
    :components="components"
    @tool-result="addToolResult"
  />
</template>
```

E é só isso. `get_weather` roda sozinha, e o modelo continua assim que o resultado chega. `confirm_booking` pausa o chat em `pending`. Quando o usuário clica em **Confirm**, o `addToolResult` registra a resposta e o chat continua. Veja [Human-in-the-loop](./tool-calling#human-in-the-loop).

## Sem MessageParts {#without-messageparts}

O `MessageParts` é opcional. Chamadas de ferramentas são partes comuns da mensagem, então você pode renderizá-las por conta própria:

```vue
<template v-for="part in message.parts">
  <WeatherCard
    v-if="part.type === 'tool-call' && part.toolName === 'get_weather'"
    v-bind="part"
    :add-result="(result) => addToolResult({ toolCallId: part.toolCallId, result })"
  />
</template>
```

Isso também funciona no Vue 2.7, onde o `vue-llm/components` não está disponível.

## Streaming dos argumentos {#streaming-arguments}

Os argumentos chegam token a token. O vue-llm faz o parse do JSON incompleto a cada chunk com `parsePartialJSON`, que também é exportado, então `args.city` aparece antes de o modelo terminar de escrever a chamada. Os campos são adicionados conforme ficam completos. Strings crescem no lugar, e chaves incompletas são descartadas até terminarem.

```ts
import { parsePartialJSON } from 'vue-llm'

parsePartialJSON('{"city":"Os')           // { city: 'Os' }
parsePartialJSON('{"items":[{"n":"a"},{') // { items: [{ n: 'a' }, {}] }
```

## Ferramentas no servidor {#server-side-tools}

Ferramentas que precisam de segredos ficam no servidor ([ferramentas do `createLLMHandler`](./server#server-tools)). As chamadas delas continuam chegando ao cliente via streaming como partes `tool-call` com `state: 'result'`, então os mesmos componentes as renderizam.
