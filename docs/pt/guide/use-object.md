---
description: 'useObject: faça streaming de saída JSON estruturada de um LLM para um ref do Vue tipado e preenchido parcialmente.'
---

# useObject

Faça streaming de um objeto JSON que segue um JSON Schema. `partialObject` é atualizado conforme os tokens chegam; `object` é definido quando o JSON fica completo.

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

O schema é adicionado ao system prompt e o modo JSON é solicitado quando o provedor suporta (`response_format` na OpenAI, `responseMimeType` no Gemini).

## Opções {#options}

`provider`, `model`, `schema` (obrigatório), `system`, `onFinish(object, ctx)`, `onError(error)`.

## Retorno {#returns}

`object`, `partialObject`, `input`, `status`, `error`, `isLoading`, `submit(prompt?)`, `stop()`, `clearError()`.
