---
description: '开箱即用的 Vue AI 聊天界面：一条命令添加 shadcn-vue 组件并完全掌控代码，或基于无头的 usePromptInput 和 useAutoScroll 组合式函数自行构建。'
---

# 聊天界面

一套完全 **属于你** 的聊天界面。组件通过 shadcn-vue CLI 以普通 `.vue` 文件的形式添加到你的项目中，因此你可以像修改其他组件一样重新设计样式或重写它们。那些容易出错的行为逻辑则包含在 `vue-llm` 包中，并随包一起更新。

<ClientOnly>
  <ChatUIDemo />
</ClientOnly>

该演示使用了一个脚本化的模型。其中的组件与 CLI 安装的组件完全相同。

## 如何拆分 {#how-it-is-split}

| 部分 | 所在位置 | 更新方式 |
|------|----------------|---------|
| `useChat`、提供方、`StreamMarkdown` | `vue-llm` 包 | `npm update vue-llm` |
| `usePromptInput`、`useAutoScroll` | `vue-llm` 包 | `npm update vue-llm` |
| `Chat`、`ChatMessage`、`ChatPromptInput`、`ChatReasoning`、`ChatToolCall` | 复制到你的项目中 | 你自己的代码；重新运行 `add` 以拉取上游变更 |

## 安装 {#install}

你需要一个 [shadcn-vue](https://www.shadcn-vue.com/docs/installation) 项目，即需要 Tailwind CSS 和 `lib/utils.ts`。

```bash
npx shadcn-vue@latest add https://vue-llm.js.org/r/chat.json
```

CLI 会安装 `vue-llm` 和你的图标库（默认为 Lucide；其他图标库会由 CLI 自动映射），并将组件写入 `components/ui/chat/`。

## 用法 {#usage}

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

`Chat` 会填满其父元素，因此请为父元素设置高度。

### 生成式 UI {#generative-ui}

为你的工具传入组件。没有对应组件的工具会使用 `ChatToolCall`，这是一个展示参数和结果的可折叠卡片。

```vue
<Chat :chat="chat" :components="{ get_weather: WeatherCard, confirm_booking: BookingCard }" />
```

如何编写工具组件，请参阅 [生成式 UI](./generative-ui)。

## 组件 {#components}

### Chat

完整的聊天界面：带自动滚动的消息列表、带建议提示的空状态、输入中指示器、带重试的错误提示、滚动到底部按钮以及输入框。

| Prop | 类型 | 说明 |
|------|------|-------------|
| `chat` | `UseChatReturn` | `useChat` 的返回值 |
| `components` | `Record<string, Component>` | 工具名 → 组件 |
| `suggestions` | `string[]` | 聊天为空时显示的提示 |
| `placeholder` | `string` | 输入框占位文本 |
| `accept` | `string \| false` | 允许的附件类型；`false` 会隐藏附件按钮 |

插槽 `#empty` 用于替换空状态的标题。

### ChatMessage

单条消息：Markdown、推理过程、工具调用、图片和文件、来源，以及复制和重新生成操作。会触发 `tool-result` 和 `regenerate` 事件。

### ChatPromptInput

一个自动增高的 textarea，支持附件（文件选择器、粘贴和拖放），并带有发送和停止按钮。接收 `chat`、`placeholder`、`accept` 和 `maxFiles`。

### ChatReasoning

可折叠的推理过程。模型思考时自动展开，开始回答时自动折叠。

### ChatToolCall

工具调用的后备卡片，显示状态以及可折叠的参数和结果。

## 主题 {#theming}

这些组件只使用 shadcn 的主题 token：`background`、`foreground`、`primary`、`muted`、`border`、`ring`、`card` 和 `destructive`。它们会跟随你的主题和深色模式。在上面的演示中试试 **Vue green**。

## 不使用 Tailwind {#without-tailwind}

不要使用 registry。改用无头组合式函数构建 UI，它们包含了上述组件中最难实现的部分：

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

请使用 `:ref="scroll.container"` 绑定模板 ref，而不是解构出 `container`。在启用了 `noUnusedLocals` 的 `vue-tsc` 中（Vite 模板默认启用），字符串形式的 `ref="container"` 不会被计为一次使用。

### usePromptInput(chat, options?)

- 按 **Enter** 发送，按 **Shift+Enter** 换行。用于确认输入法组字（中文、日文、韩文）的 Enter 永远不会触发发送。
- textarea 会随内容增高，最多到 `maxRows` 行（默认 `8`）。
- 文件可以通过 `addFiles`（文件输入框）、粘贴以及拖放到 `dropzone` 元素上来添加。`isDragging` 可用于显示拖放遮罩层。
- `accept` 和 `maxFiles` 用于过滤附件，`onReject(files, reason)` 会报告被拒绝的文件。
- `submit()` 会发送文本和文件并将两者清空。聊天忙碌时 `canSubmit` 为 false。

在 Vue 2.7 中请显式绑定处理函数（`@keydown="handlers.onKeydown" @paste="handlers.onPaste"`），因为在那里 `v-bind` 不会绑定监听器。

### useAutoScroll(options?)

- 在消息流式输出、图片或代码块增长时，让列表保持固定在底部。
- 当用户向上滚动时停止跟随，方便阅读。此时 `isAtBottom` 变为 `false`。
- `scrollToBottom('smooth')` 会重新固定到底部。
- `threshold`（默认 `48` px）设置距离底部多近仍算作“在底部”。
