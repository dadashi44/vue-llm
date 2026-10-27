---
description: 'useObject: haz streaming de salida JSON estructurada de un LLM a un ref de Vue tipado y parcialmente relleno.'
---

# useObject

Haz streaming de un objeto JSON que cumple un JSON Schema. `partialObject` se actualiza a medida que llegan los tokens; `object` se asigna cuando el JSON está completo.

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

El schema se añade al prompt de sistema y se solicita el modo JSON cuando el proveedor lo admite (`response_format` en OpenAI, `responseMimeType` en Gemini).

## Opciones {#options}

`provider`, `model`, `schema` (obligatorio), `system`, `onFinish(object, ctx)`, `onError(error)`.

## Valores devueltos {#returns}

`object`, `partialObject`, `input`, `status`, `error`, `isLoading`, `submit(prompt?)`, `stop()`, `clearError()`.
