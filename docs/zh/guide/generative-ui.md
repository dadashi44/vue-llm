---
description: '将 LLM 工具调用渲染为 Vue 组件。把工具参数流式传入 UI，在客户端运行工具，并请用户确认操作（人工介入）。'
---

# 生成式 UI

模型不仅能用文本回答，还能用 **组件** 回答。当它调用某个工具时，`<MessageParts>` 会渲染你为该工具映射的组件。组件会在参数流式传输时接收参数，随后接收结果。它还可以在对话继续之前请用户做出决定。

<ClientOnly>
  <GenerativeUIDemo />
</ClientOnly>

该演示使用了一个脚本化的模型，因此可以即时运行，无需网络。下面的代码与使用真实提供方时完全相同。

## 1. 定义工具 {#_1-define-tools}

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

## 2. 为每个工具编写组件 {#_2-write-a-component-per-tool}

工具组件接收 `ToolComponentProps<Args, Result>`：

| Prop | 说明 |
|------|-------------|
| `args` | 参数，**在 `state` 为 `'streaming'` 时是不完整的** |
| `state` | `streaming` → `pending` → `running` → `result` / `error` |
| `result` | 工具的返回值 |
| `error` | 工具抛出错误时的错误信息 |
| `addResult(result)` | 从 UI 中完成该调用 |
| `toolCallId`、`toolName` | 标识符 |

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

## 3. 渲染消息 {#_3-render-messages}

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

这就是全部配置。`get_weather` 会自行运行，结果返回后模型继续生成。`confirm_booking` 会让聊天在 `pending` 状态下暂停。当用户点击 **Confirm** 时，`addToolResult` 会记录这个回答，聊天随之继续。参阅 [人工介入](./tool-calling#human-in-the-loop)。

## 不使用 MessageParts {#without-messageparts}

`MessageParts` 是可选的。工具调用只是普通的消息 part，因此你可以自己渲染它们：

```vue
<template v-for="part in message.parts">
  <WeatherCard
    v-if="part.type === 'tool-call' && part.toolName === 'get_weather'"
    v-bind="part"
    :add-result="(result) => addToolResult({ toolCallId: part.toolCallId, result })"
  />
</template>
```

这种方式同样适用于无法使用 `vue-llm/components` 的 Vue 2.7。

## 流式参数 {#streaming-arguments}

参数是逐 token 到达的。vue-llm 会在每个 chunk 到达时用 `parsePartialJSON`（同样对外导出）解析不完整的 JSON，因此在模型写完整个调用之前，`args.city` 就已经出现了。字段会在完整后被加入；字符串会原地增长，而不完整的键在完成之前会被丢弃。

```ts
import { parsePartialJSON } from 'vue-llm'

parsePartialJSON('{"city":"Os')           // { city: 'Os' }
parsePartialJSON('{"items":[{"n":"a"},{') // { items: [{ n: 'a' }, {}] }
```

## 服务端工具 {#server-side-tools}

需要密钥的工具应放在服务端（[`createLLMHandler` 工具](./server#server-tools)）。它们的调用仍会以 `state: 'result'` 的 `tool-call` part 流式传输到客户端，因此同样的组件也能渲染它们。
