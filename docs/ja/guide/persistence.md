---
description: 'storage オプションを使い、localStorage、sessionStorage、または任意の非同期バックエンドで Vue の AI チャット履歴を保存・復元します。'
---

# 永続化

`storage` アダプターと固定の `id` を渡します。履歴は `useChat` の作成時に復元され、レスポンスが完了するたびに保存されます（ストリーミングされるトークンごとではありません）。

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

## 組み込みアダプター {#built-in-adapters}

| アダプター | 説明 |
|---------|-------------|
| `createWebStorage({ prefix?, storage? })` | デフォルトは `localStorage`。`sessionStorage` や任意の `Storage` を渡せます。SSR 中は何もしません。 |
| `createMemoryStorage()` | インメモリーのマップ。テストに便利 |

## カスタムアダプター {#custom-adapters}

`ChatStorage` を実装します。メソッドは同期でも非同期でもかまいません。

```ts
import type { ChatStorage } from 'vue-llm'

const apiStorage: ChatStorage = {
  load: id => fetch(`/api/chats/${id}`).then(r => (r.ok ? r.json() : null)),
  save: (id, messages) => fetch(`/api/chats/${id}`, { method: 'PUT', body: JSON.stringify(messages) }).then(() => {}),
  remove: id => fetch(`/api/chats/${id}`, { method: 'DELETE' }).then(() => {}),
}
```

非同期ストレージの場合、`load` が解決されるまで `isRestored` は `false` のままです。

```vue
<Spinner v-if="!isRestored" />
```

読み込みが完了する前に送信されたメッセージは保持され、保存済みの履歴で上書きされることはありません。ストレージのエラーは `onError` に渡されます。

::: warning
添付ファイルは data URL として保存されます。大きなファイルは `localStorage` の上限（約 5 MB）を超えることがあるため、ファイルを多く扱うチャットでは非同期バックエンドを使用してください。
:::
