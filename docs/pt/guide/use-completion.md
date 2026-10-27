---
description: 'useCompletion: faça streaming de uma única completion de texto de um LLM para um ref do Vue.'
---

# useCompletion

Geração de texto em turno único, com streaming para uma única string.

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

`complete(prompt?)` resolve com o texto completo:

```ts
const text = await complete('Describe a mechanical keyboard')
```

## Opções {#options}

| Opção | Tipo | Descrição |
|--------|------|-------------|
| `provider` | `LLMProvider` | Obrigatório |
| `model` | `string` | Obrigatório |
| `system` | `MaybeRefOrGetter<string>` | System prompt |
| `onFinish` | `(completion, { finishReason, usage }) => void` | Chamado ao terminar |
| `onError` | `(error) => void` | Handler de erros |

## Retorno {#returns}

`completion`, `input`, `status`, `error`, `isLoading`, `complete(prompt?)`, `handleSubmit(event?)`, `stop()`, `clearError()`.
