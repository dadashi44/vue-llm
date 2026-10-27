---
description: '通过 storage 选项，在 Vue 中使用 localStorage、sessionStorage 或任意异步后端持久化并恢复 AI 聊天记录。'
---

# 持久化

传入一个 `storage` 适配器和一个稳定的 `id`。创建 `useChat` 时会恢复历史记录，每当一次响应完成时都会保存（而不是在每个流式 token 到达时保存）。

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

## 内置适配器 {#built-in-adapters}

| 适配器 | 说明 |
|---------|-------------|
| `createWebStorage({ prefix?, storage? })` | 默认使用 `localStorage`；也可以传入 `sessionStorage` 或任意 `Storage`。SSR 期间不执行任何操作。 |
| `createMemoryStorage()` | 内存中的 Map，便于测试 |

## 自定义适配器 {#custom-adapters}

实现 `ChatStorage` 即可，方法可以是同步的，也可以是异步的：

```ts
import type { ChatStorage } from 'vue-llm'

const apiStorage: ChatStorage = {
  load: id => fetch(`/api/chats/${id}`).then(r => (r.ok ? r.json() : null)),
  save: (id, messages) => fetch(`/api/chats/${id}`, { method: 'PUT', body: JSON.stringify(messages) }).then(() => {}),
  remove: id => fetch(`/api/chats/${id}`, { method: 'DELETE' }).then(() => {}),
}
```

使用异步存储时，`isRestored` 在 `load` 完成之前会一直为 `false`：

```vue
<Spinner v-if="!isRestored" />
```

在加载完成之前发送的消息会被保留，已存储的历史记录不会覆盖它们。存储错误会交给 `onError` 处理。

::: warning
附件以 data URL 的形式存储。大文件可能会超出约 5 MB 的 `localStorage` 配额，文件较多的聊天请使用异步后端。
:::
