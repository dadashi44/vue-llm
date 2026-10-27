---
description: 'Рендерите вызовы инструментов LLM как Vue-компоненты. Стримьте аргументы инструментов в интерфейс, выполняйте инструменты на клиенте и запрашивайте подтверждение действий у пользователя (human in the loop).'
---

# Generative UI

Модель отвечает не только текстом, но и **компонентами**. Когда она вызывает инструмент, `<MessageParts>` рендерит компонент, который вы сопоставили этому инструменту. Компонент получает аргументы по мере их стриминга, а затем результат. Он также может попросить пользователя принять решение, прежде чем диалог продолжится.

<ClientOnly>
  <GenerativeUIDemo />
</ClientOnly>

Демо использует заскриптованную модель, поэтому запускается мгновенно и без сети. Код ниже такой же, как с настоящим провайдером.

## 1. Объявите инструменты {#_1-define-tools}

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

// Без execute: вызов ждёт, пока пользователь ответит в интерфейсе
export const confirmBooking = defineTool<Booking, Booking & { confirmed: boolean }>({
  name: 'confirm_booking',
  description: 'Ask the user to confirm a restaurant booking',
  parameters: { /* … */ },
})
```

## 2. Напишите компонент для каждого инструмента {#_2-write-a-component-per-tool}

Компоненты инструментов получают `ToolComponentProps<Args, Result>`:

| Проп | Описание |
|------|-------------|
| `args` | Аргументы, **неполные, пока `state` равен `'streaming'`** |
| `state` | `streaming` → `pending` → `running` → `result` / `error` |
| `result` | Значение, которое вернул инструмент |
| `error` | Текст ошибки, если инструмент её выбросил |
| `addResult(result)` | Завершает вызов из интерфейса |
| `toolCallId`, `toolName` | Идентификаторы |

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

## 3. Отрендерите сообщения {#_3-render-messages}

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

Вот и вся настройка. `get_weather` выполняется сам, и модель продолжает, как только приходит результат. `confirm_booking` ставит чат на паузу в состоянии `pending`. Когда пользователь нажимает **Confirm**, `addToolResult` записывает ответ, и чат продолжается. См. [Human in the loop](./tool-calling#human-in-the-loop).

## Без MessageParts {#without-messageparts}

`MessageParts` использовать необязательно. Вызовы инструментов — обычные части сообщения, так что их можно рендерить самостоятельно:

```vue
<template v-for="part in message.parts">
  <WeatherCard
    v-if="part.type === 'tool-call' && part.toolName === 'get_weather'"
    v-bind="part"
    :add-result="(result) => addToolResult({ toolCallId: part.toolCallId, result })"
  />
</template>
```

Это работает и на Vue 2.7, где `vue-llm/components` недоступен.

## Стриминг аргументов {#streaming-arguments}

Аргументы приходят токен за токеном. vue-llm разбирает неполный JSON на каждом чанке функцией `parsePartialJSON` (она тоже экспортируется), поэтому `args.city` появляется ещё до того, как модель допишет вызов. Поля добавляются по мере готовности. Строки растут на месте, а незаконченные ключи отбрасываются, пока не будут дописаны.

```ts
import { parsePartialJSON } from 'vue-llm'

parsePartialJSON('{"city":"Os')           // { city: 'Os' }
parsePartialJSON('{"items":[{"n":"a"},{') // { items: [{ n: 'a' }, {}] }
```

## Инструменты на сервере {#server-side-tools}

Инструментам, которым нужны секреты, место на сервере ([инструменты `createLLMHandler`](./server#server-tools)). Их вызовы всё равно стримятся на клиент как части `tool-call` с `state: 'result'`, поэтому их рендерят те же компоненты.
