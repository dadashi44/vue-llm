---
description: 'Plantillas de prompts tipadas para LLM en Vue: {{variables}} inferidas a nivel de tipos, plantillas de chat y usePrompt reactivo.'
---

# Plantillas de prompts

## createPrompt

Los nombres de las variables se infieren a partir del string de la plantilla, así que las variables que faltan o están mal escritas son errores de tipos:

```ts
import { createPrompt } from 'vue-llm'

const translate = createPrompt('Translate {{ text }} to {{lang}}.', {
  defaults: { lang: 'English' },
})

translate.render({ text: 'Hola' })            // 'Translate Hola to English.'
translate.render({ text: 'Hola', lang: 'German' })
translate.render({ txt: 'Hola' })             // ✗ type error
translate.variables                           // ['text', 'lang']
```

- Los valores pueden ser strings, números o booleanos.
- Si falta un valor, se lanza `Missing prompt variable "name"` en tiempo de ejecución.
- Escapa un placeholder con una barra invertida: `\{{literal}}` se renderiza como `{{literal}}`.

## usePrompt

Un renderizado computado que sigue a variables reactivas:

```ts
import { usePrompt, useChat } from 'vue-llm'

const lang = ref('French')
const system = usePrompt('Always reply in {{lang}}.', () => ({ lang: lang.value }))

const chat = useChat({ provider: ai, model: 'gpt-4o', system })
```

`system` en `useChat`, `useCompletion` y `useObject` acepta un ref o un getter y se lee en cada petición, así que cambiar `lang` afecta al siguiente mensaje.

## createChatPrompt

Plantillas que abarcan varios mensajes:

```ts
import { createChatPrompt } from 'vue-llm'

const tutor = createChatPrompt([
  { role: 'system', content: 'You are a {{level}} tutor.' },
  { role: 'user', content: 'Explain {{topic}}.' },
])

tutor.render({ level: 'patient', topic: 'recursion' })        // ChatMessage[] for provider.chat()
tutor.toUIMessages({ level: 'patient', topic: 'recursion' })  // UIMessage[] for initialMessages
```

Los mensajes de sistema de `initialMessages` se fusionan con la opción `system` en un único prompt de sistema.
