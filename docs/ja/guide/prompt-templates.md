---
description: 'Vue で使える LLM 向けの型付きプロンプトテンプレート：型レベルで推論される {{variables}}、チャットテンプレート、リアクティブな usePrompt。'
---

# プロンプトテンプレート

## createPrompt

変数名はテンプレート文字列から推論されるため、変数の不足やスペルミスは型エラーになります。

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

- 値には文字列、数値、真偽値を使えます。
- 値が不足していると、実行時に `Missing prompt variable "name"` がスローされます。
- プレースホルダーはバックスラッシュでエスケープできます。`\{{literal}}` は `{{literal}}` として描画されます。

## usePrompt

リアクティブな変数に追従する算出レンダリングです。

```ts
import { usePrompt, useChat } from 'vue-llm'

const lang = ref('French')
const system = usePrompt('Always reply in {{lang}}.', () => ({ lang: lang.value }))

const chat = useChat({ provider: ai, model: 'gpt-4o', system })
```

`useChat`、`useCompletion`、`useObject` の `system` には ref やゲッターを渡せ、リクエストのたびに読み取られます。そのため `lang` を変更すると次のメッセージに反映されます。

## createChatPrompt

複数のメッセージにまたがるテンプレートです。

```ts
import { createChatPrompt } from 'vue-llm'

const tutor = createChatPrompt([
  { role: 'system', content: 'You are a {{level}} tutor.' },
  { role: 'user', content: 'Explain {{topic}}.' },
])

tutor.render({ level: 'patient', topic: 'recursion' })        // ChatMessage[] for provider.chat()
tutor.toUIMessages({ level: 'patient', topic: 'recursion' })  // UIMessage[] for initialMessages
```

`initialMessages` 内のシステムメッセージは、`system` オプションとマージされて 1 つのシステムプロンプトになります。
