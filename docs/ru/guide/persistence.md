---
description: 'Сохраняйте и восстанавливайте историю AI-чата во Vue через localStorage, sessionStorage или любое асинхронное хранилище с помощью опции storage.'
---

# Сохранение истории

Передайте адаптер `storage` и стабильный `id`. История восстанавливается при создании `useChat` и сохраняется каждый раз, когда ответ завершён (а не на каждом пришедшем токене).

```ts
import { useChat, createWebStorage } from 'vue-llm'

const { messages, setMessages, isRestored } = useChat({
  id: 'support-chat',
  provider: ai,
  model: 'gpt-4o',
  storage: createWebStorage(), // ключ в localStorage: vue-llm:chat:support-chat
})

setMessages([]) // очищает историю и удаляет сохранённую запись
```

## Встроенные адаптеры {#built-in-adapters}

| Адаптер | Описание |
|---------|-------------|
| `createWebStorage({ prefix?, storage? })` | По умолчанию `localStorage`; можно передать `sessionStorage` или любой `Storage`. Во время SSR ничего не делает. |
| `createMemoryStorage()` | Map в памяти, удобно для тестов |

## Свои адаптеры {#custom-adapters}

Реализуйте `ChatStorage` — методы могут быть синхронными или асинхронными:

```ts
import type { ChatStorage } from 'vue-llm'

const apiStorage: ChatStorage = {
  load: id => fetch(`/api/chats/${id}`).then(r => (r.ok ? r.json() : null)),
  save: (id, messages) => fetch(`/api/chats/${id}`, { method: 'PUT', body: JSON.stringify(messages) }).then(() => {}),
  remove: id => fetch(`/api/chats/${id}`, { method: 'DELETE' }).then(() => {}),
}
```

С асинхронным хранилищем `isRestored` остаётся `false`, пока не завершится `load`:

```vue
<Spinner v-if="!isRestored" />
```

Сообщения, отправленные до окончания загрузки, сохраняются — сохранённая история их не перезаписывает. Ошибки хранилища попадают в `onError`.

::: warning
Вложения сохраняются как data URL. Большие файлы могут превысить квоту `localStorage` (~5 МБ) — для чатов с большим количеством файлов используйте асинхронное хранилище.
:::

## Переключение чатов {#switching-chats}

Передайте `id` как ref или геттер, чтобы переключаться между чатами одним `useChat`:

```ts
const chatId = ref('support-chat')
const { messages, isRestored } = useChat({ id: chatId, provider: ai, model: 'gpt-4o', storage })

chatId.value = 'another-chat'
```

При смене id текущий ответ останавливается, `messages` очищается и загружается история нового id (`isRestored` равен `false`, пока загрузка не закончится). Медленная загрузка чата, из которого вы уже ушли, игнорируется. Без `storage` новый чат начинается пустым. `chat.id` возвращает текущий id.
