---
description: 'Send images, PDFs, audio and text files to OpenAI, Anthropic, Gemini and Ollama from useChat, mapped to each provider format.'
---

# Attachments

Pass `File`, `FileList` or `FilePart` objects to `sendMessage`. Files are read as data URLs and stored as `file` parts on the user message.

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

Text is optional — `sendMessage({ files })` sends only the attachments.

Remote URLs skip the upload step:

```ts
sendMessage({ text: 'Describe this', files: { type: 'file', mediaType: 'image/png', url: 'https://example.com/cat.png' } })
```

## Provider support

| Provider | Images | PDF | Audio | Text | Remote URLs |
|----------|--------|-----|-------|------|-------------|
| OpenAI | ✓ | ✓ | wav, mp3 | inlined as text | images only |
| Anthropic | ✓ | ✓ | — | ✓ (document) | images, PDF |
| Google | ✓ | ✓ | ✓ | ✓ | `fileData` URIs |
| Ollama | ✓ | — | — | inlined as text | — |

Unsupported combinations throw a descriptive error before the request is sent.

## Helpers

```ts
import { fileToDataURL, convertFilesToParts } from 'vue-llm'

const url = await fileToDataURL(blob)
const parts = await convertFilesToParts(input.files) // FilePart[]
```
