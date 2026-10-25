# Components

```ts
import { StreamMarkdown } from 'vue-llm/components'
```

## StreamMarkdown

Renders an HTML string with a blinking cursor while `streaming` is true.

```vue
<StreamMarkdown :content="html" :streaming="status === 'streaming'" />
```

| Prop | Type | Description |
|------|------|-------------|
| `content` | `string` | HTML to render |
| `streaming` | `boolean` | Show the cursor |

::: danger
`content` is rendered with `v-html` and is **not** parsed or sanitized. Convert Markdown yourself and sanitize model output before passing it in:

```ts
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const html = computed(() => DOMPurify.sanitize(marked.parse(text.value) as string))
```
:::
