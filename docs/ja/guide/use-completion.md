---
description: 'useCompletion：LLM からの単一のテキスト補完を Vue の ref にストリーミングします。'
---

# useCompletion

シングルターンのテキスト生成で、結果は 1 つの文字列にストリーミングされます。

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

`complete(prompt?)` は全文で解決されます。

```ts
const text = await complete('Describe a mechanical keyboard')
```

## オプション {#options}

| オプション | 型 | 説明 |
|--------|------|-------------|
| `provider` | `LLMProvider` | 必須 |
| `model` | `string` | 必須 |
| `system` | `MaybeRefOrGetter<string>` | システムプロンプト |
| `onFinish` | `(completion, { finishReason, usage }) => void` | 完了時に呼ばれる |
| `onError` | `(error) => void` | エラーハンドラー |

## 戻り値 {#returns}

`completion`、`input`、`status`、`error`、`isLoading`、`complete(prompt?)`、`handleSubmit(event?)`、`stop()`、`clearError()`。
