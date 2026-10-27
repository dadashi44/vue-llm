---
description: 'useObject: stream structured JSON output from an LLM into a typed, partially filled Vue ref.'
---

# useObject

Stream a JSON object that matches a JSON Schema. `partialObject` updates while tokens arrive; `object` is set once the JSON is complete.

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

The schema is added to the system prompt and JSON mode is requested where the provider supports it (OpenAI `response_format`, Gemini `responseMimeType`).

## Options

`provider`, `model`, `schema` (required), `system`, `onFinish(object, ctx)`, `onError(error)`.

## Returns

`object`, `partialObject`, `input`, `status`, `error`, `isLoading`, `submit(prompt?)`, `stop()`, `clearError()`.
