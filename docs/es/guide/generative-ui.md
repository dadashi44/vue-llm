---
description: 'Renderiza las llamadas a herramientas del LLM como componentes Vue. Haz streaming de los argumentos a la UI, ejecuta herramientas en el cliente y pide al usuario que confirme las acciones (intervención humana).'
---

# Generative UI

El modelo responde con **componentes** además de texto. Cuando llama a una herramienta, `<MessageParts>` renderiza el componente que asociaste a esa herramienta. El componente recibe los argumentos mientras llegan por streaming y después el resultado. También puede pedir al usuario que decida antes de que la conversación siga.

<ClientOnly>
  <GenerativeUIDemo />
</ClientOnly>

La demo usa un modelo con guion, así que funciona al instante y sin red. El código de abajo es el mismo que con un proveedor real.

## 1. Define las herramientas {#_1-define-tools}

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

## 2. Escribe un componente por herramienta {#_2-write-a-component-per-tool}

Los componentes de herramienta reciben `ToolComponentProps<Args, Result>`:

| Prop | Descripción |
|------|-------------|
| `args` | Argumentos, **parciales mientras `state` es `'streaming'`** |
| `state` | `streaming` → `pending` → `running` → `result` / `error` |
| `result` | El valor de retorno de la herramienta |
| `error` | Mensaje de error si la herramienta lanzó uno |
| `addResult(result)` | Resuelve la llamada desde la UI |
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

## 3. Renderiza los mensajes {#_3-render-messages}

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

Esa es toda la configuración. `get_weather` se ejecuta solo y el modelo continúa en cuanto llega el resultado. `confirm_booking` pausa el chat en `pending`. Cuando el usuario pulsa **Confirm**, `addToolResult` registra la respuesta y el chat continúa. Consulta [Intervención humana](./tool-calling#human-in-the-loop).

## Sin MessageParts {#without-messageparts}

`MessageParts` es opcional. Las llamadas a herramientas son partes normales del mensaje, así que puedes renderizarlas tú mismo:

```vue
<template v-for="part in message.parts">
  <WeatherCard
    v-if="part.type === 'tool-call' && part.toolName === 'get_weather'"
    v-bind="part"
    :add-result="(result) => addToolResult({ toolCallId: part.toolCallId, result })"
  />
</template>
```

Esto también funciona en Vue 2.7, donde `vue-llm/components` no está disponible.

## Streaming de argumentos {#streaming-arguments}

Los argumentos llegan token a token. vue-llm parsea el JSON incompleto en cada chunk con `parsePartialJSON`, que también se exporta, así que `args.city` aparece antes de que el modelo termine de escribir la llamada. Los campos se añaden a medida que se completan. Los strings crecen en su sitio y las claves incompletas se descartan hasta que terminan.

```ts
import { parsePartialJSON } from 'vue-llm'

parsePartialJSON('{"city":"Os')           // { city: 'Os' }
parsePartialJSON('{"items":[{"n":"a"},{') // { items: [{ n: 'a' }, {}] }
```

## Herramientas en el servidor {#server-side-tools}

Las herramientas que necesitan secretos van en el servidor ([herramientas de `createLLMHandler`](./server#server-tools)). Sus llamadas siguen llegando al cliente por streaming como partes `tool-call` con `state: 'result'`, así que los mismos componentes las renderizan.
