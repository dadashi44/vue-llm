---
description: 'useObject：将 LLM 的结构化 JSON 输出流式写入一个带类型、逐步填充的 Vue ref。'
---

# useObject

流式输出一个符合 JSON Schema 的 JSON 对象。`partialObject` 会随着 token 的到达不断更新；`object` 会在 JSON 完整后被赋值。

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

schema 会被添加到系统提示词中，并且在提供方支持时会请求 JSON 模式（OpenAI 的 `response_format`、Gemini 的 `responseMimeType`）。

## 选项 {#options}

`provider`、`model`、`schema`（必填）、`system`、`onFinish(object, ctx)`、`onError(error)`。

## 返回值 {#returns}

`object`、`partialObject`、`input`、`status`、`error`、`isLoading`、`submit(prompt?)`、`stop()`、`clearError()`。
