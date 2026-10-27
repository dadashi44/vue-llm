---
description: 'Typed prompt templates for LLMs in Vue: {{variables}} inferred at the type level, chat templates and reactive usePrompt.'
---

# Prompt Templates

## createPrompt

Variable names are inferred from the template string, so missing or misspelled variables are type errors:

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

- Values may be strings, numbers or booleans.
- A missing value throws `Missing prompt variable "name"` at runtime.
- Escape a placeholder with a backslash: `\{{literal}}` renders as `{{literal}}`.

## usePrompt

A computed render that follows reactive variables:

```ts
import { usePrompt, useChat } from 'vue-llm'

const lang = ref('French')
const system = usePrompt('Always reply in {{lang}}.', () => ({ lang: lang.value }))

const chat = useChat({ provider: ai, model: 'gpt-4o', system })
```

`system` in `useChat`, `useCompletion` and `useObject` accepts a ref or getter and is read on every request, so changing `lang` affects the next message.

## createChatPrompt

Templates spanning several messages:

```ts
import { createChatPrompt } from 'vue-llm'

const tutor = createChatPrompt([
  { role: 'system', content: 'You are a {{level}} tutor.' },
  { role: 'user', content: 'Explain {{topic}}.' },
])

tutor.render({ level: 'patient', topic: 'recursion' })        // ChatMessage[] for provider.chat()
tutor.toUIMessages({ level: 'patient', topic: 'recursion' })  // UIMessage[] for initialMessages
```

System messages in `initialMessages` are merged with the `system` option into a single system prompt.
