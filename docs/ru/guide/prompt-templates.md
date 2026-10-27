---
description: 'Типизированные шаблоны промптов для LLM во Vue: {{variables}}, выводимые на уровне типов, шаблоны чата и реактивный usePrompt.'
---

# Шаблоны промптов

## createPrompt {#createprompt}

Имена переменных выводятся из строки шаблона, поэтому пропущенная переменная или опечатка в её имени — это ошибка типов:

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

- Значения могут быть строками, числами или булевыми.
- Если значение не передано, в рантайме выбрасывается `Missing prompt variable "name"`.
- Плейсхолдер экранируется обратным слешем: `\{{literal}}` отрендерится как `{{literal}}`.

## usePrompt {#useprompt}

Вычисляемый рендеринг, который следит за реактивными переменными:

```ts
import { usePrompt, useChat } from 'vue-llm'

const lang = ref('French')
const system = usePrompt('Always reply in {{lang}}.', () => ({ lang: lang.value }))

const chat = useChat({ provider: ai, model: 'gpt-4o', system })
```

`system` в `useChat`, `useCompletion` и `useObject` принимает ref или геттер и читается при каждом запросе, поэтому изменение `lang` повлияет на следующее сообщение.

## createChatPrompt {#createchatprompt}

Шаблоны из нескольких сообщений:

```ts
import { createChatPrompt } from 'vue-llm'

const tutor = createChatPrompt([
  { role: 'system', content: 'You are a {{level}} tutor.' },
  { role: 'user', content: 'Explain {{topic}}.' },
])

tutor.render({ level: 'patient', topic: 'recursion' })        // ChatMessage[] для provider.chat()
tutor.toUIMessages({ level: 'patient', topic: 'recursion' })  // UIMessage[] для initialMessages
```

Системные сообщения из `initialMessages` объединяются с опцией `system` в один системный промпт.
