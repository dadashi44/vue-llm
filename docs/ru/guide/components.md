---
description: 'MessageParts и StreamMarkdown: Vue-компоненты для рендеринга стримящихся сообщений LLM, безопасного Markdown, рассуждений и вызовов инструментов.'
---

# Компоненты

```ts
import { MessageParts, StreamMarkdown } from 'vue-llm/components'
import 'vue-llm/style.css' // анимация курсора и небольшие базовые стили разметки
```

Nuxt-модуль регистрирует оба компонента и таблицу стилей за вас.

Полноценный стилизованный интерфейс чата описан в разделе [Chat UI](./chat-ui).

::: info
Компонентам нужен Vue 3. На Vue 2.7 используйте `renderMarkdown` вместе с `v-html` — это обычный TypeScript.
:::

## MessageParts {#messageparts}

Рендерит сообщение целиком: текст в Markdown, сворачиваемые рассуждения, изображения, источники и вызовы инструментов через ваши компоненты. См. [Generative UI](./generative-ui).

```vue
<MessageParts
  v-for="msg in messages"
  :key="msg.id"
  :message="msg"
  :components="{ get_weather: WeatherCard }"
  @tool-result="addToolResult"
/>
```

| Проп / событие | Описание |
|------|-------------|
| `message` | `UIMessage` |
| `components` | Имя инструмента → компонент. Компонент получает `ToolComponentProps` |
| `render` | Свой рендерер Markdown, как в `StreamMarkdown` |
| `@tool-result` | Срабатывает с `{ toolCallId, result }`, когда компонент инструмента вызывает `addResult` |
| Слот `#tool` | Запасной вариант для инструментов без компонента: `{ part, addResult }` |

У корневого элемента есть `class="vue-llm-message"` и атрибут `data-role` с ролью сообщения. Части используют классы `vue-llm-text`, `vue-llm-reasoning`, `vue-llm-file` и `vue-llm-source`, так что их можно стилизовать.

## StreamMarkdown {#streammarkdown}

Рендерит Markdown от модели прямо во время стриминга, с мигающим курсором.

```vue
<script setup lang="ts">
const { messages, status } = useChat({ provider: ai, model: 'gpt-4o' })
</script>

<template>
  <div v-for="msg in messages" :key="msg.id">
    <template v-for="(part, i) in msg.parts" :key="i">
      <StreamMarkdown
        v-if="part.type === 'text'"
        :content="part.text"
        :streaming="part.state === 'streaming'"
      />
    </template>
  </div>
</template>
```

| Проп | Тип | Описание |
|------|------|-------------|
| `content` | `string` | Исходный Markdown |
| `streaming` | `boolean` | Показывать курсор |
| `render` | `(markdown: string) => string` | Заменяет встроенный рендерер |

Встроенный рендерер не имеет зависимостей и поддерживает заголовки, абзацы, жирный/курсив/зачёркнутый текст, инлайн-код, блоки кода (класс `language-*` для подсветки синтаксиса), списки, цитаты, таблицы, горизонтальные линии, ссылки и изображения. Незакрытый блок кода рендерится как код, поэтому недостримленные фрагменты выглядят правильно.

### Безопасность {#security}

Ответам модели нельзя доверять. Встроенный рендерер:

- экранирует весь текст, поэтому сырой HTML вроде `<script>` или `<img onerror>` показывается как текст и никогда не парсится;
- разрешает в ссылках и изображениях только `http(s):`, `mailto:` и относительные URL, а `javascript:`, `data:`, протокол-относительные и прочие URL отбрасывает;
- открывает ссылки с `target="_blank" rel="noopener noreferrer"`.

Свою функцию `render` vue-llm **не** санитизирует. Если вы используете полноценную библиотеку Markdown, санитизируйте её вывод:

```ts
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const render = (md: string) => DOMPurify.sanitize(marked.parse(md) as string)
```

```vue
<StreamMarkdown :content="text" :render="render" />
```

Рендерер также экспортируется для использования вне компонента:

```ts
import { renderMarkdown } from 'vue-llm/components'

const html = renderMarkdown('**Hello**') // '<p><strong>Hello</strong></p>'
```
