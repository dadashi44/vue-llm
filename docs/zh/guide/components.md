---
description: 'MessageParts 与 StreamMarkdown：用于渲染流式 LLM 消息、安全 Markdown、推理过程和工具调用的 Vue 组件。'
---

# 组件

```ts
import { MessageParts, StreamMarkdown } from 'vue-llm/components'
import 'vue-llm/style.css' // cursor animation and small layout defaults
```

Nuxt 模块会为你自动注册这两个组件和样式表。

如需一套完整、带样式的聊天界面，请参阅 [聊天界面](./chat-ui)。

::: info
组件需要 Vue 3。在 Vue 2.7 中，请将 `renderMarkdown` 与 `v-html` 搭配使用，它是纯 TypeScript 实现。
:::

## MessageParts

渲染整条消息：Markdown 文本、可折叠的推理过程、图片、来源，以及通过你自己的组件渲染的工具调用。参阅 [生成式 UI](./generative-ui)。

```vue
<MessageParts
  v-for="msg in messages"
  :key="msg.id"
  :message="msg"
  :components="{ get_weather: WeatherCard }"
  @tool-result="addToolResult"
/>
```

| Prop / 事件 | 说明 |
|------|-------------|
| `message` | 一个 `UIMessage` |
| `components` | 工具名 → 组件。组件会接收 `ToolComponentProps` |
| `render` | 自定义 Markdown 渲染器，与 `StreamMarkdown` 中相同 |
| `@tool-result` | 当工具组件调用 `addResult` 时触发，参数为 `{ toolCallId, result }` |
| `#tool` 插槽 | 没有对应组件的工具的后备内容：`{ part, addResult }` |

根元素带有 `class="vue-llm-message"`，并且 `data-role` 设置为消息的角色。各个 part 使用 `vue-llm-text`、`vue-llm-reasoning`、`vue-llm-file` 和 `vue-llm-source` 类名，方便你为它们添加样式。

## StreamMarkdown

在模型流式输出时渲染其 Markdown，并显示一个闪烁的光标。

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

| Prop | 类型 | 说明 |
|------|------|-------------|
| `content` | `string` | Markdown 源文本 |
| `streaming` | `boolean` | 显示光标 |
| `render` | `(markdown: string) => string` | 替换内置渲染器 |

内置渲染器没有任何依赖，支持标题、段落、粗体/斜体/删除线、行内代码、围栏代码块（带有供高亮库使用的 `language-*` 类名）、列表、引用块、表格、分割线、链接和图片。未闭合的代码围栏会被渲染为代码，因此流式输出到一半的代码片段也能正确显示。

### 安全 {#security}

模型输出是不可信的。内置渲染器会：

- 转义所有文本，因此 `<script>` 或 `<img onerror>` 等原始 HTML 会作为文本显示，永远不会被解析；
- 在链接和图片中只允许 `http(s):`、`mailto:` 和相对 URL，并丢弃 `javascript:`、`data:`、协议相对 URL 以及其他 URL；
- 以 `target="_blank" rel="noopener noreferrer"` 打开链接。

自定义的 `render` 函数 **不会** 经过 vue-llm 的净化处理。如果你使用完整的 Markdown 库，请对其输出进行净化：

```ts
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const render = (md: string) => DOMPurify.sanitize(marked.parse(md) as string)
```

```vue
<StreamMarkdown :content="text" :render="render" />
```

该渲染器也对外导出，可以在组件之外使用：

```ts
import { renderMarkdown } from 'vue-llm/components'

const html = renderMarkdown('**Hello**') // '<p><strong>Hello</strong></p>'
```
