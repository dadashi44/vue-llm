---
description: 'Отправляйте изображения, PDF, аудио и текстовые файлы в OpenAI, Anthropic, Gemini и Ollama из useChat — в формате каждого провайдера.'
---

# Вложения

Передавайте в `sendMessage` объекты `File`, `FileList` или `FilePart`. Файлы читаются как data URL и сохраняются как части `file` в сообщении пользователя.

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

Текст необязателен — `sendMessage({ files })` отправит только вложения.

Для удалённых URL шаг загрузки пропускается:

```ts
sendMessage({ text: 'Describe this', files: { type: 'file', mediaType: 'image/png', url: 'https://example.com/cat.png' } })
```

## Поддержка провайдерами {#provider-support}

| Провайдер | Изображения | PDF | Аудио | Текст | Удалённые URL |
|----------|--------|-----|-------|------|-------------|
| OpenAI | ✓ | ✓ | wav, mp3 | встраивается как текст | только изображения |
| Anthropic | ✓ | ✓ | — | ✓ (document) | изображения, PDF |
| Google | ✓ | ✓ | ✓ | ✓ | URI `fileData` |
| Ollama | ✓ | — | — | встраивается как текст | — |

Для неподдерживаемых комбинаций ещё до отправки запроса выбрасывается ошибка с понятным описанием.

## Хелперы {#helpers}

```ts
import { fileToDataURL, convertFilesToParts } from 'vue-llm'

const url = await fileToDataURL(blob)
const parts = await convertFilesToParts(input.files) // FilePart[]
```
