---
description: Render LLM tool calls as Vue components. Stream tool arguments into the UI, run tools on the client and ask the user to confirm actions (human in the loop).
---

# Generative UI

The model answers with **components** as well as text. When it calls a tool, `<MessageParts>` renders the component you mapped to that tool. The component receives the arguments while they stream, then the result. It can also ask the user to decide before the conversation goes on.

<ClientOnly>
  <GenerativeUIDemo />
</ClientOnly>

The demo uses a scripted model so it runs instantly and without a network. The code below is the same as with a real provider.

## 1. Define tools

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

## 2. Write a component per tool

Tool components receive `ToolComponentProps<Args, Result>`:

| Prop | Description |
|------|-------------|
| `args` | Arguments, **partial while `state` is `'streaming'`** |
| `state` | `streaming` → `pending` → `running` → `result` / `error` |
| `result` | The tool's return value |
| `error` | Error message if the tool threw |
| `addResult(result)` | Resolve the call from the UI |
| `toolCallId`, `toolName` | Identifiers |

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

## 3. Render messages

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

That's the whole setup. `get_weather` runs on its own, and the model continues once the result arrives. `confirm_booking` pauses the chat in `pending`. When the user clicks **Confirm**, `addToolResult` records the answer and the chat continues. See [Human in the loop](./tool-calling#human-in-the-loop).

## Without MessageParts

`MessageParts` is optional. Tool calls are ordinary message parts, so you can render them yourself:

```vue
<template v-for="part in message.parts">
  <WeatherCard
    v-if="part.type === 'tool-call' && part.toolName === 'get_weather'"
    v-bind="part"
    :add-result="(result) => addToolResult({ toolCallId: part.toolCallId, result })"
  />
</template>
```

This also works on Vue 2.7, where `vue-llm/components` is not available.

## Streaming arguments

Arguments arrive token by token. vue-llm parses the incomplete JSON on every chunk with `parsePartialJSON`, which is also exported, so `args.city` appears before the model has finished writing the call. Fields are added as they complete. Strings grow in place, and incomplete keys are dropped until they finish.

```ts
import { parsePartialJSON } from 'vue-llm'

parsePartialJSON('{"city":"Os')           // { city: 'Os' }
parsePartialJSON('{"items":[{"n":"a"},{') // { items: [{ n: 'a' }, {}] }
```

## Server-side tools

Tools that need secrets belong on the server ([`createLLMHandler` tools](./server#server-tools)). Their calls still stream to the client as `tool-call` parts with `state: 'result'`, so the same components render them.
