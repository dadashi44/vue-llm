---
description: 'Persist and restore AI chat history in Vue with localStorage, sessionStorage or any async backend through the storage option.'
---

# Persistence

Pass a `storage` adapter and a stable `id`. History is restored when `useChat` is created and saved whenever a response finishes (not on every streamed token).

```ts
import { useChat, createWebStorage } from 'vue-llm'

const { messages, setMessages, isRestored } = useChat({
  id: 'support-chat',
  provider: ai,
  model: 'gpt-4o',
  storage: createWebStorage(), // localStorage key: vue-llm:chat:support-chat
})

setMessages([]) // clears history and removes the stored entry
```

## Built-in adapters

| Adapter | Description |
|---------|-------------|
| `createWebStorage({ prefix?, storage? })` | `localStorage` by default; pass `sessionStorage` or any `Storage`. No-op during SSR. |
| `createMemoryStorage()` | In-memory map, handy for tests |

## Custom adapters

Implement `ChatStorage` — methods may be sync or async:

```ts
import type { ChatStorage } from 'vue-llm'

const apiStorage: ChatStorage = {
  load: id => fetch(`/api/chats/${id}`).then(r => (r.ok ? r.json() : null)),
  save: (id, messages) => fetch(`/api/chats/${id}`, { method: 'PUT', body: JSON.stringify(messages) }).then(() => {}),
  remove: id => fetch(`/api/chats/${id}`, { method: 'DELETE' }).then(() => {}),
}
```

With async storage `isRestored` stays `false` until `load` resolves:

```vue
<Spinner v-if="!isRestored" />
```

Messages sent before the load finishes are kept — stored history never overwrites them. Storage errors go to `onError`.

::: warning
Attachments are stored as data URLs. Large files can exceed the ~5 MB `localStorage` quota — use an async backend for file-heavy chats.
:::
