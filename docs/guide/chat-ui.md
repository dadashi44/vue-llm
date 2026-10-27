---
description: 'A ready-made AI chat UI for Vue: add shadcn-vue components with one command and own the code, or build your own with the headless usePromptInput and useAutoScroll composables.'
---

# Chat UI

A complete chat interface you **own**. The components are added to your project with the shadcn-vue CLI as plain `.vue` files, so you can restyle or rewrite them like any other component. The behaviour that is easy to get wrong ships in the `vue-llm` package and updates with it.

<ClientOnly>
  <ChatUIDemo />
</ClientOnly>

The demo uses a scripted model. The components are the same ones the CLI installs.

## How it is split

| Part | Where it lives | Updates |
|------|----------------|---------|
| `useChat`, providers, `StreamMarkdown` | `vue-llm` package | `npm update vue-llm` |
| `usePromptInput`, `useAutoScroll` | `vue-llm` package | `npm update vue-llm` |
| `Chat`, `ChatMessage`, `ChatPromptInput`, `ChatReasoning`, `ChatToolCall` | copied into your project | your code; re-run `add` to pull upstream changes |

## Install

You need a [shadcn-vue](https://www.shadcn-vue.com/docs/installation) project, which means Tailwind CSS and `lib/utils.ts`.

```bash
npx shadcn-vue@latest add https://vue-llm.js.org/r/chat.json
```

The CLI installs `vue-llm` and your icon library (Lucide by default; other icon libraries are mapped by the CLI) and writes the components to `components/ui/chat/`.

## Usage

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

`Chat` fills its parent, so give the parent a height.

### Generative UI

Pass components for your tools. Tools without a component use `ChatToolCall`, a collapsible card with arguments and result.

```vue
<Chat :chat="chat" :components="{ get_weather: WeatherCard, confirm_booking: BookingCard }" />
```

See [Generative UI](./generative-ui) for writing tool components.

## Components

### Chat

The full chat: message list with auto-scroll, empty state with suggestions, typing indicator, error with retry, a scroll-to-bottom button and the input.

| Prop | Type | Description |
|------|------|-------------|
| `chat` | `UseChatReturn` | The return value of `useChat` |
| `components` | `Record<string, Component>` | Tool name → component |
| `suggestions` | `string[]` | Prompts shown while the chat is empty |
| `placeholder` | `string` | Input placeholder |
| `accept` | `string \| false` | Accepted attachments; `false` hides the attach button |

Slot `#empty` replaces the empty-state heading.

### ChatMessage

One message: Markdown, reasoning, tool calls, images and files, sources, and copy and regenerate actions. Emits `tool-result` and `regenerate`.

### ChatPromptInput

An auto-growing textarea with attachments (file picker, paste and drag-and-drop), and send and stop buttons. Takes `chat`, `placeholder`, `accept` and `maxFiles`.

### ChatReasoning

Collapsible reasoning. It opens while the model thinks and collapses when the answer starts.

### ChatToolCall

The fallback card for tool calls, with state and collapsible arguments and result.

## Theming

The components only use the shadcn theme tokens: `background`, `foreground`, `primary`, `muted`, `border`, `ring`, `card` and `destructive`. They follow your theme and dark mode. Try **Vue green** in the demo above.

## Without Tailwind

Don't use the registry. Build the UI from the headless composables, which hold the hard parts of the components above:

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

Bind the template refs with `:ref="scroll.container"` rather than destructuring `container`. `vue-tsc` with `noUnusedLocals`, which the Vite templates enable, doesn't count a string `ref="container"` as a use.

### usePromptInput(chat, options?)

- **Enter** sends and **Shift+Enter** adds a newline. Enter that confirms an IME composition (Chinese, Japanese, Korean) never sends.
- The textarea grows with its content up to `maxRows` (default `8`).
- Files are attached from `addFiles` (file inputs), from paste and from drag-and-drop on the `dropzone` element. `isDragging` lets you show a drop overlay.
- `accept` and `maxFiles` filter attachments, and `onReject(files, reason)` reports the rejected ones.
- `submit()` sends the text and files and clears both. `canSubmit` is false while the chat is busy.

On Vue 2.7 bind the handlers explicitly (`@keydown="handlers.onKeydown" @paste="handlers.onPaste"`), because `v-bind` doesn't attach listeners there.

### useAutoScroll(options?)

- Keeps the list pinned to the bottom while messages stream and while images or code blocks grow.
- Stops following when the user scrolls up, so they can read. `isAtBottom` becomes `false`.
- `scrollToBottom('smooth')` pins it again.
- `threshold` (default `48` px) sets how close to the bottom still counts as "at the bottom".
