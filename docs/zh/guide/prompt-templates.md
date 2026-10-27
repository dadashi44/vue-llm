---
description: '在 Vue 中为 LLM 编写带类型的提示词模板：在类型层面推断 {{variables}}，支持聊天模板和响应式的 usePrompt。'
---

# 提示词模板

## createPrompt

变量名会从模板字符串中推断出来，因此缺失或拼错的变量会成为类型错误：

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

- 值可以是字符串、数字或布尔值。
- 缺少某个值时，运行时会抛出 `Missing prompt variable "name"`。
- 用反斜杠转义占位符：`\{{literal}}` 会渲染为 `{{literal}}`。

## usePrompt

一个跟随响应式变量变化的计算渲染结果：

```ts
import { usePrompt, useChat } from 'vue-llm'

const lang = ref('French')
const system = usePrompt('Always reply in {{lang}}.', () => ({ lang: lang.value }))

const chat = useChat({ provider: ai, model: 'gpt-4o', system })
```

`useChat`、`useCompletion` 和 `useObject` 中的 `system` 接受 ref 或 getter，并在每次请求时读取，因此修改 `lang` 会影响下一条消息。

## createChatPrompt

跨越多条消息的模板：

```ts
import { createChatPrompt } from 'vue-llm'

const tutor = createChatPrompt([
  { role: 'system', content: 'You are a {{level}} tutor.' },
  { role: 'user', content: 'Explain {{topic}}.' },
])

tutor.render({ level: 'patient', topic: 'recursion' })        // ChatMessage[] for provider.chat()
tutor.toUIMessages({ level: 'patient', topic: 'recursion' })  // UIMessage[] for initialMessages
```

`initialMessages` 中的 system 消息会与 `system` 选项合并为单个系统提示词。
