# useCompletion

Single-turn text generation, streamed into one string.

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

`complete(prompt?)` resolves with the full text:

```ts
const text = await complete('Describe a mechanical keyboard')
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `provider` | `LLMProvider` | Required |
| `model` | `string` | Required |
| `system` | `MaybeRefOrGetter<string>` | System prompt |
| `onFinish` | `(completion, { finishReason, usage }) => void` | Called when done |
| `onError` | `(error) => void` | Error handler |

## Returns

`completion`, `input`, `status`, `error`, `isLoading`, `complete(prompt?)`, `handleSubmit(event?)`, `stop()`, `clearError()`.
