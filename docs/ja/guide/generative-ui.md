---
description: 'LLM のツール呼び出しを Vue コンポーネントとして描画します。ツールの引数を UI にストリーミングし、クライアントでツールを実行し、ユーザーにアクションの確認を求められます（human in the loop）。'
---

# Generative UI

モデルはテキストだけでなく **コンポーネント** でも応答します。モデルがツールを呼び出すと、`<MessageParts>` はそのツールに割り当てたコンポーネントを描画します。コンポーネントはストリーミング中の引数を受け取り、続いて結果を受け取ります。会話を続ける前に、ユーザーに判断を求めることもできます。

<ClientOnly>
  <GenerativeUIDemo />
</ClientOnly>

このデモはスクリプト化されたモデルを使っているため、ネットワークなしで即座に動作します。以下のコードは実際のプロバイダーを使う場合と同じです。

## 1. ツールを定義する {#_1-define-tools}

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

## 2. ツールごとにコンポーネントを書く {#_2-write-a-component-per-tool}

ツールコンポーネントは `ToolComponentProps<Args, Result>` を受け取ります。

| プロパティ | 説明 |
|------|-------------|
| `args` | 引数。**`state` が `'streaming'` の間は部分的** |
| `state` | `streaming` → `pending` → `running` → `result` / `error` |
| `result` | ツールの戻り値 |
| `error` | ツールが例外をスローした場合のエラーメッセージ |
| `addResult(result)` | UI から呼び出しを解決する |
| `toolCallId`, `toolName` | 識別子 |

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

## 3. メッセージを描画する {#_3-render-messages}

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

セットアップはこれだけです。`get_weather` は自動で実行され、結果が届くとモデルが続行します。`confirm_booking` はチャットを `pending` で一時停止させます。ユーザーが **Confirm** をクリックすると、`addToolResult` が回答を記録し、チャットが再開します。[Human in the loop](./tool-calling#human-in-the-loop) を参照してください。

## MessageParts を使わない場合 {#without-messageparts}

`MessageParts` は必須ではありません。ツール呼び出しは通常のメッセージパーツなので、自分で描画することもできます。

```vue
<template v-for="part in message.parts">
  <WeatherCard
    v-if="part.type === 'tool-call' && part.toolName === 'get_weather'"
    v-bind="part"
    :add-result="(result) => addToolResult({ toolCallId: part.toolCallId, result })"
  />
</template>
```

この方法は `vue-llm/components` が使えない Vue 2.7 でも動作します。

## 引数のストリーミング {#streaming-arguments}

引数はトークン単位で届きます。vue-llm はチャンクを受け取るたびに、エクスポートもされている `parsePartialJSON` で不完全な JSON をパースします。そのため、モデルが呼び出しを書き終える前から `args.city` が表示されます。フィールドは完成した時点で追加されます。文字列はその場で伸びていき、不完全なキーは完成するまで除外されます。

```ts
import { parsePartialJSON } from 'vue-llm'

parsePartialJSON('{"city":"Os')           // { city: 'Os' }
parsePartialJSON('{"items":[{"n":"a"},{') // { items: [{ n: 'a' }, {}] }
```

## サーバーサイドのツール {#server-side-tools}

シークレットが必要なツールはサーバーに置きます（[`createLLMHandler` のツール](./server#server-tools)）。その呼び出しも `state: 'result'` の `tool-call` パーツとしてクライアントにストリーミングされるため、同じコンポーネントで描画できます。
