---
description: 'useCompletion：将 LLM 的单次文本补全流式写入 Vue ref。'
---

# useCompletion

单轮文本生成，流式写入一个字符串。

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

`complete(prompt?)` 会以完整文本 resolve：

```ts
const text = await complete('Describe a mechanical keyboard')
```

## 选项 {#options}

| 选项 | 类型 | 说明 |
|--------|------|-------------|
| `provider` | `LLMProvider` | 必填 |
| `model` | `string` | 必填 |
| `system` | `MaybeRefOrGetter<string>` | 系统提示词 |
| `onFinish` | `(completion, { finishReason, usage }) => void` | 完成时调用 |
| `onError` | `(error) => void` | 错误处理函数 |

## 返回值 {#returns}

`completion`、`input`、`status`、`error`、`isLoading`、`complete(prompt?)`、`handleSubmit(event?)`、`stop()`、`clearError()`。
