---
description: 'useObject: стриминг структурированного JSON-ответа LLM в типизированный, частично заполненный Vue ref.'
---

# useObject

Стримит JSON-объект, соответствующий JSON Schema. `partialObject` обновляется по мере поступления токенов; `object` устанавливается, когда JSON получен полностью.

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

Схема добавляется в системный промпт, а там, где провайдер это поддерживает, запрашивается JSON-режим (`response_format` в OpenAI, `responseMimeType` в Gemini).

## Опции {#options}

`provider`, `model`, `schema` (обязательны), `system`, `onFinish(object, ctx)`, `onError(error)`.

## Возвращаемые значения {#returns}

`object`, `partialObject`, `input`, `status`, `error`, `isLoading`, `submit(prompt?)`, `stop()`, `clearError()`.
