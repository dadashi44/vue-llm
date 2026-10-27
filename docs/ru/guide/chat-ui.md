---
description: 'Готовый интерфейс AI-чата для Vue: добавьте компоненты shadcn-vue одной командой и владейте кодом сами или соберите свой интерфейс на headless-композаблах usePromptInput и useAutoScroll.'
---

# Chat UI

Полноценный интерфейс чата, код которого **принадлежит вам**. Компоненты добавляются в проект через shadcn-vue CLI как обычные `.vue`-файлы, так что их можно перестилизовать или переписать, как любой другой компонент. Поведение, в котором легко ошибиться, поставляется в пакете `vue-llm` и обновляется вместе с ним.

<ClientOnly>
  <ChatUIDemo />
</ClientOnly>

Демо использует заскриптованную модель. Компоненты — те же, что устанавливает CLI.

## Как всё разделено {#how-it-is-split}

| Часть | Где находится | Обновления |
|------|----------------|---------|
| `useChat`, провайдеры, `StreamMarkdown` | пакет `vue-llm` | `npm update vue-llm` |
| `usePromptInput`, `useAutoScroll` | пакет `vue-llm` | `npm update vue-llm` |
| `Chat`, `ChatMessage`, `ChatPromptInput`, `ChatReasoning`, `ChatToolCall` | копируются в ваш проект | ваш код; запустите `add` ещё раз, чтобы подтянуть изменения из апстрима |

## Установка {#install}

Нужен проект с [shadcn-vue](https://www.shadcn-vue.com/docs/installation), то есть с Tailwind CSS и `lib/utils.ts`.

```bash
npx shadcn-vue@latest add https://dadashi44.github.io/vue-llm/r/chat.json
```

CLI устанавливает `vue-llm` и вашу библиотеку иконок (по умолчанию Lucide; другие библиотеки иконок CLI сопоставляет сам) и записывает компоненты в `components/ui/chat/`.

## Использование {#usage}

```vue
<script setup lang="ts">
import { useChat } from 'vue-llm'
import { createSSEProvider } from 'vue-llm/providers'
import { Chat } from '@/components/ui/chat'

const chat = useChat({
  provider: createSSEProvider({ url: '/api/chat' }),
  model: 'gpt-4o',
})
</script>

<template>
  <div class="h-dvh">
    <Chat :chat="chat" :suggestions="['Summarize this page', 'Write a haiku']" />
  </div>
</template>
```

`Chat` заполняет родителя целиком, поэтому задайте родителю высоту.

### Generative UI {#generative-ui}

Передайте компоненты для своих инструментов. Инструменты без компонента используют `ChatToolCall` — сворачиваемую карточку с аргументами и результатом.

```vue
<Chat :chat="chat" :components="{ get_weather: WeatherCard, confirm_booking: BookingCard }" />
```

Как писать компоненты инструментов, см. в разделе [Generative UI](./generative-ui).

## Компоненты {#components}

### Chat {#chat}

Чат целиком: список сообщений с автопрокруткой, пустое состояние с подсказками, индикатор набора, ошибка с кнопкой повтора, кнопка прокрутки вниз и поле ввода.

| Проп | Тип | Описание |
|------|------|-------------|
| `chat` | `UseChatReturn` | Значение, возвращённое `useChat` |
| `components` | `Record<string, Component>` | Имя инструмента → компонент |
| `suggestions` | `string[]` | Подсказки, которые показываются, пока чат пуст |
| `placeholder` | `string` | Плейсхолдер поля ввода |
| `accept` | `string \| false` | Допустимые вложения; `false` скрывает кнопку прикрепления |

Слот `#empty` заменяет заголовок пустого состояния.

### ChatMessage {#chatmessage}

Одно сообщение: Markdown, рассуждения, вызовы инструментов, изображения и файлы, источники, а также действия «скопировать» и «сгенерировать заново». Генерирует события `tool-result` и `regenerate`.

### ChatPromptInput {#chatpromptinput}

Авторастущий textarea с вложениями (выбор файла, вставка и drag-and-drop) и кнопками отправки и остановки. Принимает `chat`, `placeholder`, `accept` и `maxFiles`.

### ChatReasoning {#chatreasoning}

Сворачиваемые рассуждения. Блок раскрывается, пока модель думает, и сворачивается, когда начинается ответ.

### ChatToolCall {#chattoolcall}

Запасная карточка для вызовов инструментов: состояние и сворачиваемые аргументы и результат.

## Темы {#theming}

Компоненты используют только токены темы shadcn: `background`, `foreground`, `primary`, `muted`, `border`, `ring`, `card` и `destructive`. Они следуют вашей теме и тёмному режиму. Попробуйте **Vue green** в демо выше.

## Без Tailwind {#without-tailwind}

Не используйте реестр. Соберите интерфейс на headless-композаблах — в них заключена вся сложная часть компонентов выше:

```vue
<script setup lang="ts">
import { useAutoScroll, useChat, usePromptInput } from 'vue-llm'

const chat = useChat({ provider, model: 'gpt-4o' })
const { input, messages } = chat
const prompt = usePromptInput(chat)
const { files, canSubmit, submit, removeFile, handlers, dropzone } = prompt
const scroll = useAutoScroll()
const { isAtBottom, scrollToBottom } = scroll
</script>

<template>
  <div :ref="scroll.container" class="messages">
    <MyMessage v-for="m in messages" :key="m.id" :message="m" />
  </div>
  <button v-if="!isAtBottom" @click="scrollToBottom('smooth')">↓</button>

  <form v-bind="dropzone" @submit.prevent="submit">
    <span v-for="f in files" :key="f.name">{{ f.name }} <button type="button" @click="removeFile(f)">×</button></span>
    <textarea :ref="prompt.textarea" v-model="input" rows="1" v-bind="handlers" />
    <button :disabled="!canSubmit">Send</button>
  </form>
</template>
```

Привязывайте template ref-ы через `:ref="scroll.container"`, а не деструктурируя `container`. `vue-tsc` с `noUnusedLocals`, который включён в шаблонах Vite, не считает строковый `ref="container"` использованием переменной.

### usePromptInput(chat, options?) {#usepromptinput-chat-options}

- **Enter** отправляет сообщение, **Shift+Enter** добавляет перенос строки. Enter, которым подтверждается ввод через IME (китайский, японский, корейский), никогда не отправляет сообщение.
- Textarea растёт вместе с содержимым до `maxRows` строк (по умолчанию `8`).
- Файлы прикрепляются через `addFiles` (для file input), вставкой и перетаскиванием на элемент `dropzone`. С помощью `isDragging` можно показать оверлей для сброса файлов.
- `accept` и `maxFiles` фильтруют вложения, а `onReject(files, reason)` сообщает об отклонённых.
- `submit()` отправляет текст и файлы и очищает их. `canSubmit` равен false, пока чат занят.

На Vue 2.7 привязывайте обработчики явно (`@keydown="handlers.onKeydown" @paste="handlers.onPaste"`), потому что там `v-bind` не навешивает слушатели.

### useAutoScroll(options?) {#useautoscroll-options}

- Держит список прижатым к низу, пока стримятся сообщения и пока растут изображения или блоки кода.
- Перестаёт следовать, когда пользователь прокручивает вверх, чтобы он мог спокойно читать. `isAtBottom` становится `false`.
- `scrollToBottom('smooth')` снова прижимает список к низу.
- `threshold` (по умолчанию `48` px) задаёт, насколько близко к низу ещё считается «внизу».
