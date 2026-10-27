---
description: 'Envía imágenes, PDF, audio y archivos de texto a OpenAI, Anthropic, Gemini y Ollama desde useChat, adaptados al formato de cada proveedor.'
---

# Adjuntos

Pasa objetos `File`, `FileList` o `FilePart` a `sendMessage`. Los archivos se leen como data URLs y se guardan como partes `file` en el mensaje del usuario.

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

El texto es opcional: `sendMessage({ files })` envía solo los adjuntos.

Las URLs remotas se saltan el paso de subida:

```ts
sendMessage({ text: 'Describe this', files: { type: 'file', mediaType: 'image/png', url: 'https://example.com/cat.png' } })
```

## Compatibilidad por proveedor {#provider-support}

| Proveedor | Imágenes | PDF | Audio | Texto | URLs remotas |
|----------|--------|-----|-------|------|-------------|
| OpenAI | ✓ | ✓ | wav, mp3 | insertado como texto | solo imágenes |
| Anthropic | ✓ | ✓ | — | ✓ (document) | imágenes, PDF |
| Google | ✓ | ✓ | ✓ | ✓ | URIs `fileData` |
| Ollama | ✓ | — | — | insertado como texto | — |

Las combinaciones no compatibles lanzan un error descriptivo antes de enviar la petición.

## Helpers

```ts
import { fileToDataURL, convertFilesToParts } from 'vue-llm'

const url = await fileToDataURL(blob)
const parts = await convertFilesToParts(input.files) // FilePart[]
```
