---
description: 'Templates de prompt tipados para LLMs em Vue: {{variables}} inferidas no nível de tipos, templates de chat e usePrompt reativo.'
---

# Templates de prompt

## createPrompt

Os nomes das variáveis são inferidos a partir da string do template, então variáveis ausentes ou com erro de digitação viram erros de tipo:

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

- Os valores podem ser strings, números ou booleanos.
- Um valor ausente lança `Missing prompt variable "name"` em runtime.
- Escape um placeholder com barra invertida: `\{{literal}}` é renderizado como `{{literal}}`.

## usePrompt

Um render computado que acompanha variáveis reativas:

```ts
import { usePrompt, useChat } from 'vue-llm'

const lang = ref('French')
const system = usePrompt('Always reply in {{lang}}.', () => ({ lang: lang.value }))

const chat = useChat({ provider: ai, model: 'gpt-4o', system })
```

O `system` no `useChat`, `useCompletion` e `useObject` aceita um ref ou getter e é lido a cada requisição, então mudar `lang` afeta a próxima mensagem.

## createChatPrompt

Templates que abrangem várias mensagens:

```ts
import { createChatPrompt } from 'vue-llm'

const tutor = createChatPrompt([
  { role: 'system', content: 'You are a {{level}} tutor.' },
  { role: 'user', content: 'Explain {{topic}}.' },
])

tutor.render({ level: 'patient', topic: 'recursion' })        // ChatMessage[] for provider.chat()
tutor.toUIMessages({ level: 'patient', topic: 'recursion' })  // UIMessage[] for initialMessages
```

Mensagens de sistema em `initialMessages` são mescladas com a opção `system` em um único system prompt.
