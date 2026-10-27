---
description: 'useChat から OpenAI、Anthropic、Gemini、Ollama に画像、PDF、音声、テキストファイルを送信します。各プロバイダーの形式に自動で変換されます。'
---

# 添付ファイル

`sendMessage` に `File`、`FileList`、`FilePart` オブジェクトを渡します。ファイルは data URL として読み込まれ、ユーザーメッセージの `file` パーツとして保存されます。

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

テキストは省略可能です。`sendMessage({ files })` は添付ファイルだけを送信します。

リモート URL の場合、アップロードの手順は省略されます。

```ts
sendMessage({ text: 'Describe this', files: { type: 'file', mediaType: 'image/png', url: 'https://example.com/cat.png' } })
```

## プロバイダーの対応状況 {#provider-support}

| プロバイダー | 画像 | PDF | 音声 | テキスト | リモート URL |
|----------|--------|-----|-------|------|-------------|
| OpenAI | ✓ | ✓ | wav, mp3 | テキストとしてインライン展開 | 画像のみ |
| Anthropic | ✓ | ✓ | — | ✓（document） | 画像、PDF |
| Google | ✓ | ✓ | ✓ | ✓ | `fileData` URI |
| Ollama | ✓ | — | — | テキストとしてインライン展開 | — |

サポートされていない組み合わせの場合は、リクエストを送信する前にわかりやすいエラーがスローされます。

## ヘルパー {#helpers}

```ts
import { fileToDataURL, convertFilesToParts } from 'vue-llm'

const url = await fileToDataURL(blob)
const parts = await convertFilesToParts(input.files) // FilePart[]
```
