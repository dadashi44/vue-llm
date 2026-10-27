---
description: 'Envie imagens, PDFs, áudio e arquivos de texto para OpenAI, Anthropic, Gemini e Ollama a partir do useChat, convertidos para o formato de cada provedor.'
---

# Anexos

Passe objetos `File`, `FileList` ou `FilePart` para `sendMessage`. Os arquivos são lidos como data URLs e guardados como partes `file` na mensagem do usuário.

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

O texto é opcional — `sendMessage({ files })` envia só os anexos.

URLs remotas pulam a etapa de upload:

```ts
sendMessage({ text: 'Describe this', files: { type: 'file', mediaType: 'image/png', url: 'https://example.com/cat.png' } })
```

## Suporte por provedor {#provider-support}

| Provedor | Imagens | PDF | Áudio | Texto | URLs remotas |
|----------|--------|-----|-------|------|-------------|
| OpenAI | ✓ | ✓ | wav, mp3 | inline como texto | só imagens |
| Anthropic | ✓ | ✓ | — | ✓ (document) | imagens, PDF |
| Google | ✓ | ✓ | ✓ | ✓ | URIs `fileData` |
| Ollama | ✓ | — | — | inline como texto | — |

Combinações não suportadas lançam um erro descritivo antes de a requisição ser enviada.

## Helpers

```ts
import { fileToDataURL, convertFilesToParts } from 'vue-llm'

const url = await fileToDataURL(blob)
const parts = await convertFilesToParts(input.files) // FilePart[]
```
