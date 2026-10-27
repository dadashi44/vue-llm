---
description: 'Vue での LLM のツール呼び出し・関数呼び出し：execute 付きの defineTool、onToolCall、ツール呼び出しの状態、addToolResult による human-in-the-loop。'
---

# ツール呼び出し

ツールは JSON Schema のパラメーターで宣言します。`execute` を持つツールは自動的に実行され、その戻り値がモデルに返されて会話が続きます。

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

`defineTool` は型を付けるだけです。`execute` はパース済みの引数と、チャットが停止されたときに中断される `signal` を受け取ります。例外がスローされた場合は、モデルが回復できるようにエラーメッセージがモデルに送られます。

## onToolCall

`execute` を持たないツールは、すべてのツールを 1 か所で処理するハンドラー `onToolCall` に渡されます。

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

## ライフサイクル {#lifecycle}

各呼び出しは、アシスタントメッセージ上の `tool-call` パーツとして表示されます。

| `state` | 意味 |
|---------|---------|
| `streaming` | 引数を受信中です。`args` にはそれまでにパースされた内容が入ります。 |
| `pending` | 引数がそろい、結果を待っている状態 |
| `running` | `execute` / `onToolCall` を実行中 |
| `result` | `result` に戻り値が入っている |
| `error` | ツールが例外をスローした。`error` にメッセージが入っている |

## Human in the loop {#human-in-the-loop}

結果が得られない呼び出し（`execute` がなく、`onToolCall` も存在しないか `undefined` を返す場合）は、チャットを `pending` のまま **一時停止** させます。UI から `addToolResult` で解決してください。保留中の呼び出しがなくなると、チャットは結果を送信して会話を続けます。

```ts
await addToolResult({ toolCallId, result: { approved: true } })
await addToolResult({ toolCallId, error: 'The user declined' })
```

結果を記録するだけにしたい場合は `autoSendToolResults: false` を設定します。ユーザーが代わりに新しいメッセージを送信した場合、未回答の呼び出しは回答されなかったものとしてモデルに伝えられます。

これらの呼び出しをコンポーネントとして描画するには、[Generative UI](./generative-ui) を参照してください。

`maxToolRoundtrips`（デフォルトは `5`）は、1 つのメッセージに対してモデルがツールを呼び出せる回数の上限です。

## サーバーサイドのツール {#server-side-tools}

シークレットやデータベースへのアクセスが必要なツールは、サーバー上で実行すべきです。[`createLLMHandler`](./server#server-tools) を使う場合はツールに `execute` を追加し、独自のバックエンドを使う場合は [`createSSEProvider`](./custom-backends#server-side-tool-results) を通じて `tool-result` チャンクを送出します。どちらの場合もパーツの `state` は `result` になり、クライアントから追加のリクエストは発生しません。
