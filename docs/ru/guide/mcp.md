---
description: 'MCP-серверы (Model Context Protocol) во Vue: mcpTools превращает инструменты любого MCP-сервера в инструменты для useChat и createLLMHandler.'
---

# MCP

[MCP](https://modelcontextprotocol.io) (Model Context Protocol) — стандартный способ дать модели инструменты: поиск, файлы, GitHub, базы данных и [сотни других](https://github.com/modelcontextprotocol/servers). `mcpTools` из `vue-llm/mcp` принимает подключённый MCP-клиент и превращает инструменты его сервера в обычные инструменты vue-llm, так что модель может вызывать их в `useChat` и `createLLMHandler`.

## Установка {#setup}

vue-llm использует клиент из официального SDK и не включает его в свою сборку. Установите его рядом с vue-llm:

```bash
npm i @modelcontextprotocol/sdk
```

## На сервере {#on-the-server}

Подключайте MCP на сервере, если MCP-серверу нужен API-ключ или он работает локально (stdio). Обработчик сам вызывает инструменты и стримит результаты в браузер:

```ts
// server/api/chat.post.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createOpenAI } from 'vue-llm/providers'
import { createLLMHandler } from 'vue-llm/server'
import { mcpTools } from 'vue-llm/mcp'

const client = new Client({ name: 'my-app', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` } },
}))

const handler = createLLMHandler({
  provider: createOpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
  model: 'gpt-4o',
  tools: await mcpTools(client),
})

export default defineEventHandler(event => handler(toWebRequest(event)))
```

К локальному MCP-серверу подключайтесь через stdio:

```ts
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

await client.connect(new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', './docs'],
}))
```

На клиенте ничего не меняется: `useChat` с [`createProxyProvider`](./server) показывает каждый вызов MCP как часть `tool-call` с результатом, а [`MessageParts`](./components#messageparts) и [DevTools](./devtools) отображают его как любой другой инструмент.

## В браузере {#in-the-browser}

Публичный MCP-сервер, которому не нужны секреты, можно использовать прямо из `useChat`. Сервер должен разрешать ваш origin через CORS и отдавать заголовок `Mcp-Session-Id`.

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { useChat } from 'vue-llm'
import { mcpTools } from 'vue-llm/mcp'

const client = new Client({ name: 'my-app', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL('https://mcp.example.com/mcp')))

const { messages, sendMessage } = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: await mcpTools(client),
})
```

`useChat` выполняет вызовы, отправляет результаты модели и продолжает диалог — как с любым [инструментом с `execute`](./tool-calling). Остановка чата прерывает текущий вызов MCP.

## Опции {#options}

```ts
await mcpTools(client, {
  include: ['search', 'fetch'], // только эти инструменты
  exclude: ['delete_file'],     // или все, кроме этих
  prefix: 'github',             // github_search, github_fetch…
})
```

| Опция | Описание |
|--------|-------------|
| `include` | Только эти инструменты, по их имени на MCP-сервере |
| `exclude` | Исключить эти инструменты |
| `prefix` | Добавляется перед каждым именем как `prefix_name`. Пригодится, когда вы объединяете инструменты нескольких серверов. |
| `signal` | Отменяет получение списка инструментов |

Инструменты нескольких серверов можно собрать в один список:

```ts
tools: [
  ...await mcpTools(github, { prefix: 'github' }),
  ...await mcpTools(docs, { prefix: 'docs' }),
  getWeather,
]
```

## Результаты {#results}

- Если инструмент возвращает `structuredContent`, модель получает этот объект.
- Если он возвращает только текст, модель получает текст.
- Остальной контент (изображения, ресурсы) передаётся как массив content из MCP.
- Если инструмент сообщает об ошибке (`isError`), вызов завершается в состоянии `error` с сообщением инструмента, и модель может исправиться.

Символы, которые провайдеры не принимают в именах инструментов (всё, кроме букв, цифр, `_` и `-`), заменяются на `_`. MCP-сервер всегда вызывается с исходным именем.

## Безопасность {#security}

Инструменты MCP-сервера работают с теми правами, которые вы дали этому серверу. Прежде чем подключать сервер:

- Подключайте только серверы, которым доверяете. Описания и результаты инструментов попадают к модели и могут содержать адресованные ей инструкции (prompt injection).
- Через `include` открывайте только те инструменты, которые нужны чату, особенно если сервер умеет записывать или удалять.
- Храните токены MCP-серверов на сервере. Всё, что передаётся клиенту в браузере, видно пользователям.
