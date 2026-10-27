---
description: 'useCompletion: haz streaming de un único completado de texto de un LLM a un ref de Vue.'
---

# useCompletion

Generación de texto de un solo turno, transmitida a un único string.

```vue
<script setup lang="ts">
import { useCompletion } from 'vue-llm'

const { completion, input, handleSubmit, isLoading, stop } = useCompletion({
  provider: ai,
  model: 'gpt-4o-mini',
  system: 'You write concise product descriptions.',
})
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <input v-model="input" placeholder="Product name">
  </form>
  <p>{{ completion }}</p>
</template>
```

`complete(prompt?)` se resuelve con el texto completo:

```ts
const text = await complete('Describe a mechanical keyboard')
```

## Opciones {#options}

| Opción | Tipo | Descripción |
|--------|------|-------------|
| `provider` | `LLMProvider` | Obligatoria |
| `model` | `string` | Obligatoria |
| `system` | `MaybeRefOrGetter<string>` | Prompt de sistema |
| `onFinish` | `(completion, { finishReason, usage }) => void` | Se llama al terminar |
| `onError` | `(error) => void` | Manejador de errores |

## Valores devueltos {#returns}

`completion`, `input`, `status`, `error`, `isLoading`, `complete(prompt?)`, `handleSubmit(event?)`, `stop()`, `clearError()`.
