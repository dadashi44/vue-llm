---
description: 'useCompletion: стриминг одного текстового ответа LLM в Vue ref.'
---

# useCompletion

Одноразовая генерация текста, которая стримится в одну строку.

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

`complete(prompt?)` возвращает промис с полным текстом:

```ts
const text = await complete('Describe a mechanical keyboard')
```

## Опции {#options}

| Опция | Тип | Описание |
|--------|------|-------------|
| `provider` | `LLMProvider` | Обязательна |
| `model` | `string` | Обязательна |
| `system` | `MaybeRefOrGetter<string>` | Системный промпт |
| `onFinish` | `(completion, { finishReason, usage }) => void` | Вызывается по завершении |
| `onError` | `(error) => void` | Обработчик ошибок |

## Возвращаемые значения {#returns}

`completion`, `input`, `status`, `error`, `isLoading`, `complete(prompt?)`, `handleSubmit(event?)`, `stop()`, `clearError()`.
