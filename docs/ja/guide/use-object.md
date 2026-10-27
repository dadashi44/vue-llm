---
description: 'useObject：LLM からの構造化された JSON 出力を、型付きで部分的に埋まっていく Vue の ref にストリーミングします。'
---

# useObject

JSON Schema に一致する JSON オブジェクトをストリーミングします。`partialObject` はトークンが届くたびに更新され、`object` は JSON が完成した時点でセットされます。

```ts
import { useObject } from 'vue-llm'

interface Recipe {
  name: string
  ingredients: string[]
  minutes: number
}

const { object, partialObject, submit, isLoading } = useObject<Recipe>({
  provider: ai,
  model: 'gpt-4o',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      ingredients: { type: 'array', items: { type: 'string' } },
      minutes: { type: 'number' },
    },
    required: ['name', 'ingredients', 'minutes'],
  },
})

await submit('A quick vegan pasta')
```

```vue
<h2>{{ partialObject?.name }}</h2>
<ul><li v-for="item in partialObject?.ingredients" :key="item">{{ item }}</li></ul>
```

スキーマはシステムプロンプトに追加され、プロバイダーが対応している場合は JSON モードが要求されます（OpenAI の `response_format`、Gemini の `responseMimeType`）。

## オプション {#options}

`provider`、`model`、`schema`（必須）、`system`、`onFinish(object, ctx)`、`onError(error)`。

## 戻り値 {#returns}

`object`、`partialObject`、`input`、`status`、`error`、`isLoading`、`submit(prompt?)`、`stop()`、`clearError()`。
