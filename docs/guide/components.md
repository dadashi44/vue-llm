# Components

```ts
import { StreamMarkdown } from 'vue-llm/components'
```

## StreamMarkdown

Renders Markdown from the model while it streams, with a blinking cursor.

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

| Prop | Type | Description |
|------|------|-------------|
| `content` | `string` | Markdown source |
| `streaming` | `boolean` | Show the cursor |
| `render` | `(markdown: string) => string` | Replace the built-in renderer |

The built-in renderer has no dependencies and supports headings, paragraphs, bold/italic/strikethrough, inline code, fenced code blocks (`language-*` class for highlighters), lists, blockquotes, tables, horizontal rules, links and images. An unclosed code fence is rendered as code, so half-streamed snippets look right.

### Security

Model output is untrusted. The built-in renderer:

- escapes all text, so raw HTML such as `<script>` or `<img onerror>` is shown as text and never parsed;
- allows only `http(s):`, `mailto:` and relative URLs in links and images, and drops `javascript:`, `data:`, protocol-relative and other URLs;
- opens links with `target="_blank" rel="noopener noreferrer"`.

A custom `render` function is **not** sanitized by vue-llm. If you use a full Markdown library, sanitize its output:

```ts
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const render = (md: string) => DOMPurify.sanitize(marked.parse(md) as string)
```

```vue
<StreamMarkdown :content="text" :render="render" />
```

The renderer is also exported for use outside the component:

```ts
import { renderMarkdown } from 'vue-llm/components'

const html = renderMarkdown('**Hello**') // '<p><strong>Hello</strong></p>'
```
