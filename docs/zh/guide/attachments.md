---
description: '在 useChat 中向 OpenAI、Anthropic、Gemini 和 Ollama 发送图片、PDF、音频和文本文件，并自动转换为各提供方的格式。'
---

# 附件

向 `sendMessage` 传入 `File`、`FileList` 或 `FilePart` 对象。文件会被读取为 data URL，并作为 `file` part 存储在用户消息中。

```vue
<script setup lang="ts">
const { messages, input, sendMessage } = useChat({ provider: ai, model: 'gpt-4o' })
const files = ref<FileList>()

async function submit() {
  await sendMessage({ text: input.value, files: files.value })
  input.value = ''
  files.value = undefined
}
</script>

<template>
  <input type="file" multiple @change="files = ($event.target as HTMLInputElement).files ?? undefined">
  <input v-model="input" @keydown.enter="submit">
</template>
```

文本是可选的：`sendMessage({ files })` 只发送附件。

远程 URL 会跳过上传步骤：

```ts
sendMessage({ text: 'Describe this', files: { type: 'file', mediaType: 'image/png', url: 'https://example.com/cat.png' } })
```

## 提供方支持 {#provider-support}

| 提供方 | 图片 | PDF | 音频 | 文本 | 远程 URL |
|----------|--------|-----|-------|------|-------------|
| OpenAI | ✓ | ✓ | wav、mp3 | 内联为文本 | 仅图片 |
| Anthropic | ✓ | ✓ | — | ✓（document） | 图片、PDF |
| Google | ✓ | ✓ | ✓ | ✓ | `fileData` URI |
| Ollama | ✓ | — | — | 内联为文本 | — |

不支持的组合会在发送请求之前抛出描述清晰的错误。

## 辅助函数 {#helpers}

```ts
import { fileToDataURL, convertFilesToParts } from 'vue-llm'

const url = await fileToDataURL(blob)
const parts = await convertFilesToParts(input.files) // FilePart[]
```
