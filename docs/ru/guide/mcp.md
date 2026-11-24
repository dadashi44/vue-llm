---
description: 'MCP-серверы (Model Context Protocol) во Vue: mcpTools превращает инструменты любого MCP-сервера в инструменты для useChat и createLLMHandler, а useMCP и useMCPServers дают пользователям подключать свои серверы.'
---

# MCP

[MCP](https://modelcontextprotocol.io) (Model Context Protocol) — стандартный способ дать модели инструменты: поиск, файлы, GitHub, базы данных и [сотни других](https://github.com/modelcontextprotocol/servers). `mcpTools` из `vue-llm/mcp` принимает подключённый MCP-клиент и превращает инструменты его сервера в обычные инструменты vue-llm, так что модель может вызывать их в `useChat` и `createLLMHandler`. Чтобы каждый пользователь мог подключить из чата свои серверы (Notion, Linear…), см. [Пользователи подключают свои серверы](#let-users-connect-their-own-servers).

## Установка {#setup}

`mcpTools` использует клиент из официального SDK, а vue-llm не включает его в свою сборку. Установите его рядом с vue-llm (для `useMCP` и `useMCPServers` он не нужен):

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

## Пользователи подключают свои серверы {#let-users-connect-their-own-servers}

`mcpTools` подключает серверы, которые выбрали вы, с вашими ключами. `useMCP` и `useMCPServers` позволяют каждому пользователю чата подключить *свои* MCP-серверы — свой Notion, свой Linear, — как коннекторы в Claude и ChatGPT. Пользователь нажимает «Подключить», входит в аккаунт провайдера во всплывающем окне, и у чата появляются инструменты этого сервера. Для этого в vue-llm есть собственный MCP-клиент, так что `@modelcontextprotocol/sdk` не нужен.

### Два режима {#two-modes}

API на фронтенде в обоих режимах одинаковый, режим выбирается для приложения целиком.

| | Режим браузера | Серверный режим |
|---|---|---|
| Как включить | `useMCPServers({ catalog })` | `useMCPServers({ server: '/api/mcp' })` + `createMCPConnector` на бэкенде |
| Кто обращается к MCP-серверу | браузер пользователя | ваш бэкенд |
| Токены пользователя | хранилище браузера (по умолчанию `localStorage`) | ваше хранилище (база данных, KV), в зашифрованном виде |
| Уязвимы для XSS в вашем приложении | да | нет — браузер не видит токены провайдера |
| Нужен бэкенд | нет | да (обычно он у чата уже есть — ради API-ключа модели) |
| Какие серверы работают | те, у которых вход и CORS работают из браузера: проверено с Notion и Linear; Hugging Face и DeepWiki проверены на доступ из браузера | серверы на Streamable HTTP, вход в которые может пройти на бэкенде; проверено на тестовых серверах из репозитория vue-llm. GitHub требует вашего OAuth-приложения и должен работать, но пока не проверен |
| Где выполняются инструменты | в `useChat` в браузере | в `createLLMHandler` на сервере |

В продакшене используйте серверный режим. Режим браузера — быстрый старт, когда бэкенда нет.

### Режим браузера {#browser-mode}

#### Страница возврата {#the-callback-page}

После входа провайдер перенаправляет всплывающее окно на страницу вашего приложения, по умолчанию `/mcp/callback`. Эта страница вызывает `handleMCPCallback()`: функция передаёт результат окну чата и закрывает всплывающее окно. С Vue Router:

```ts
// router.ts
{ path: '/mcp/callback', component: () => import('./McpCallback.vue') }
```

```vue
<!-- McpCallback.vue (в Nuxt: pages/mcp/callback.vue) -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { handleMCPCallback } from 'vue-llm/mcp'

onMounted(() => handleMCPCallback())
</script>

<template>
  <p>Signing in…</p>
</template>
```

Подойдёт любая страница на том же origin, например статическая `public/mcp/callback.html`:

```html
<script type="module">
  import { handleMCPCallback } from 'https://cdn.jsdelivr.net/npm/vue-llm@1/dist/mcp.js'
  handleMCPCallback()
</script>
```

Другой путь задаётся через `callbackUrl`. Не меняйте его без нужды: провайдер запоминает этот адрес, когда регистрирует ваше приложение.

#### Несколько серверов: `useMCPServers` {#several-servers-usemcpservers}

`useMCPServers` ведёт список серверов: каталог, который задаёте вы и в котором пользователь включает и выключает серверы, а с `allowCustom` — ещё и серверы, которые пользователь добавляет по URL. В `mcpServers` из `vue-llm/mcp` есть готовые описания для Notion, Linear, Hugging Face, DeepWiki и GitHub (см. [какие серверы работают в браузере](#which-servers-work-in-the-browser)).

```ts
import { ref } from 'vue'
import { useChat, useMCPServers } from 'vue-llm'
import { mcpServers } from 'vue-llm/mcp'

const connectors = useMCPServers({
  catalog: [
    mcpServers.notion,
    mcpServers.linear,
    mcpServers.huggingface,
    { id: 'docs', name: 'DeepWiki', url: 'https://mcp.deepwiki.com/mcp' },
  ],
  allowCustom: true,
})

const chat = useChat({
  provider: ai,
  model: 'gpt-4o',
  tools: () => [...connectors.tools.value, getWeather],
})

const newUrl = ref('')
```

В `tools` — инструменты всех включённых серверов в состоянии `ready`. Имя каждого инструмента начинается с id его сервера (`notion_search`, `linear_create_issue`), поэтому инструменты разных серверов не пересекаются. `useChat` перечитывает список перед каждым запросом, так что инструменты появляются сразу, как только сервер подключился.

Список можно отрисовать как угодно:

```vue
<template>
  <ul>
    <li v-for="server in connectors.list.value" :key="server.id">
      {{ server.name }} <small>{{ server.url }}</small>

      <button v-if="!server.enabled" @click="connectors.enable(server.id)">Turn on</button>
      <template v-else>
        <button v-if="server.state === 'needs-auth'" @click="connectors.authorize(server.id)">Sign in</button>
        <span v-else-if="server.state === 'authorizing'">
          Waiting for sign-in…
          <a v-if="server.authUrl" :href="server.authUrl" target="_blank">open the sign-in page</a>
        </span>
        <span v-else-if="server.state === 'ready'">{{ server.tools.length }} tools</span>
        <span v-else-if="server.state === 'failed'">{{ server.error?.message }}</span>
        <button @click="connectors.disable(server.id)">Turn off</button>
      </template>

      <button v-if="server.custom" @click="connectors.remove(server.id)">Remove</button>
    </li>
  </ul>

  <form @submit.prevent="connectors.add({ url: newUrl })">
    <input v-model="newUrl" placeholder="https://mcp.example.com/mcp">
    <button>Add server</button>
  </form>
</template>
```

| Метод | Что делает |
|--------|-------------|
| `enable(id)` | Включает сервер и подключается с сохранёнными учётными данными. Всплывающее окно не открывает: если нужен вход, состояние становится `needs-auth`. |
| `authorize(id)` | Открывает окно входа (и включает сервер). Вызывайте по клику: окна, открытые позже, браузер блокирует. |
| `disable(id)` | Выключает сервер, вход сохраняется. |
| `add({ url, name? })` | Добавляет сервер по URL (нужен `allowCustom`) и возвращает его id, полученный из хоста (`mcp.example.com` → `example`). Только `https://`, для разработки — `http://localhost`. Неверный URL не бросает исключение: запись получает состояние `failed` с причиной. Если такой URL уже есть в списке, возвращается id этого сервера, второй раз он не добавляется. Можно добавить до 20 серверов, URL — до 2048 символов, имя — до 100. |
| `remove(id)` | Удаляет добавленный пользователем сервер вместе с токенами. Серверы из каталога можно только выключить. |
| `refresh()` | Заново подключает все включённые серверы. |

У каждого элемента `list` есть `id`, `name`, `url`, `custom`, `enabled`, `state`, `error`, `authUrl` и `tools`. Какие серверы включены и какие добавил пользователь, сохраняется там же, где токены.

Состояния: `idle` (выключен), `connecting`, `needs-auth`, `authorizing` (открыто окно входа), `ready` и `failed`. Если браузер заблокировал всплывающее окно, состояние остаётся `authorizing`, а в `authUrl` лежит адрес входа — покажите его ссылкой, как в примере выше.

Опции: `catalog`, `allowCustom` (по умолчанию `false`), `callbackUrl`, `clientName` (показывается на экране согласия провайдера; по умолчанию `document.title`) и `storage`.

#### Как ограничить инструменты {#limiting-tools}

Модель получает все инструменты каждого включённого сервера — с описанием и схемой входных данных. Notion (77 инструментов) и Linear (70) вместе уже превышают лимит OpenAI в 128 инструментов на запрос, а каждая схема расходует токены промпта на каждом шаге. Укажите у записи каталога `include` (только эти инструменты) или `exclude` (все, кроме этих) — по именам инструментов на MCP-сервере:

```ts
const connectors = useMCPServers({
  catalog: [
    { ...mcpServers.notion, include: ['notion-search', 'notion-fetch'] },
    { id: 'docs', url: 'https://mcp.example.com/mcp', exclude: ['delete_page'] },
  ],
})
```

В серверном режиме задайте их так же в `servers` коннектора; каталог на фронтенде там ничего не фильтрует. Серверы, добавленные пользователем, получают все свои инструменты.

#### Один сервер: `useMCP` {#one-server-usemcp}

Для одного сервера `useMCP` даёт то же состояние напрямую:

```ts
import { useMCP } from 'vue-llm'

const notion = useMCP({ url: 'https://mcp.notion.com/mcp', prefix: 'notion' })

useChat({ provider: ai, model: 'gpt-4o', tools: () => notion.tools.value })
```

```vue
<button v-if="notion.state.value === 'needs-auth'" @click="notion.authorize()">Connect Notion</button>
```

| Опция | Описание |
|--------|-------------|
| `url` | Адрес сервера (Streamable HTTP) |
| `prefix`, `include`, `exclude` | Как в [`mcpTools`](#options) |
| `autoConnect` | Подключаться при монтировании с сохранёнными учётными данными. По умолчанию `true`. Всплывающее окно никогда не открывает. |
| `callbackUrl` | По умолчанию `${location.origin}/mcp/callback` |
| `clientName` | Показывается на экране согласия провайдера. По умолчанию `document.title` |
| `storage` | `'local'` (по умолчанию), `'session'`, `'memory'` или свой адаптер |

Возвращает `state`, `tools`, `error`, `authUrl`, `serverInfo` (имя и версия от сервера) и методы `connect()`, `authorize()`, `disconnect()` (закрывает сессию, вход сохраняется) и `logout()`.

`logout()` (и `remove()` в `useMCPServers`) забывает вход пользователя: токены удаляются. Регистрация вашего приложения у провайдера остаётся, так что при следующем входе регистрироваться заново не придётся.

#### Какие серверы работают в браузере {#which-servers-work-in-the-browser}

В режиме браузера сам браузер обращается к MCP-серверу, к его метаданным входа, к эндпоинтам регистрации и токенов. Это работает, только если сервер разрешает такие запросы через CORS и поддерживает динамическую регистрацию клиентов и PKCE.

- Проверены с настоящим входом: **Notion** и **Linear**.
- Проверены на доступ из браузера (CORS и метаданные входа): **Hugging Face** и **DeepWiki** (DeepWiki вход не нужен).
- На ноябрь 2026 года эти серверы не пускают браузер, поэтому для них используйте серверный режим: GitHub (нет динамической регистрации клиентов, нет CORS на эндпоинте токенов), Vercel и Stripe (нет CORS на MCP-эндпоинте), Asana (нет CORS на MCP-эндпоинте, нет динамической регистрации), Atlassian (CORS не разрешает заголовок `Authorization`).

Если сервер не пускает браузер, запись завершается ошибкой `MCPUnsupportedServerError` с сообщением, которое отсылает к серверному режиму. `mcpServers.github` в режиме браузера показывается в списке в состоянии `failed`.

Прежде чем предлагать кнопку «Войти», дайте серверам подключиться (`autoConnect` или `enable()`). Тогда сервер, который не пускает браузеры, сразу покажет `failed`, и пользователю не придётся входить в окне, которое ни к чему не приведёт.

#### Где хранятся токены {#where-tokens-are-kept}

`storage` определяет, где хранятся токены, регистрации клиентов и список серверов:

- `'local'` (по умолчанию) — `localStorage`; пользователь остаётся в системе между визитами.
- `'session'` — `sessionStorage`; вход сбрасывается, когда вкладка закрывается.
- `'memory'` — ничего не сохраняется; вход сбрасывается при перезагрузке.
- свой адаптер: `{ get(key), set(key, value), remove(key) }`, синхронный или асинхронный.

Токены в хранилище браузера может прочитать любой скрипт на странице: XSS-уязвимость в вашем приложении раскрывает их. Для более строгих сценариев используйте `'session'` или `'memory'` — или серверный режим, где браузер вообще не получает токены.

### Серверный режим {#server-mode}

`createMCPConnector` из `vue-llm/server` проводит вход и держит MCP-соединения на вашем бэкенде. Токены хранятся в вашем хранилище в зашифрованном виде и не попадают в браузер. Инструменты выполняются в [`createLLMHandler`](./server#server-tools), а их вызовы, как обычно, стримятся в `useChat`. Пример для Nuxt:

```ts
// server/utils/mcp.ts
import { createMCPConnector } from 'vue-llm/server'
import { mcpServers } from 'vue-llm/mcp'

export const mcp = createMCPConnector({
  basePath: '/api/mcp',
  publicUrl: 'https://app.example.com',
  servers: [mcpServers.notion, mcpServers.linear, mcpServers.deepwiki],
  user: request => getUserId(request), // ваша авторизация: постоянный id пользователя или null, если он не вошёл
  store: useStorage('mcp'),
  secret: process.env.MCP_SECRET,
})
```

```ts
// server/api/mcp/[...path].ts
export default defineEventHandler(event => mcp.handler(toWebRequest(event)))
```

```ts
// server/api/chat.post.ts
import { createOpenAI } from 'vue-llm/providers'
import { createLLMHandler } from 'vue-llm/server'

const handler = createLLMHandler({
  provider: createOpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
  model: 'gpt-4o',
  tools: request => mcp.toolsFor(request),
})

export default defineEventHandler(event => handler(toWebRequest(event)))
```

`toolsFor(request)` возвращает инструменты включённых и подключённых серверов этого пользователя. Сервер, который не ответил или требует войти заново, пропускается и не ломает чат.

На фронтенде вместо каталога передайте `server` — список придёт с бэкенда:

```ts
import { useChat, useMCPServers } from 'vue-llm'
import { createProxyProvider } from 'vue-llm/server'

const connectors = useMCPServers({ server: '/api/mcp' })

const chat = useChat({
  provider: createProxyProvider('/api/chat'),
  onFinish: () => connectors.refresh(),
})
```

Шаблон подходит тот же. `connectors.tools` остаётся пустым, потому что инструменты выполняются на сервере. Список загружается заново при `refresh()`, когда окно получает фокус, и после входа. Вызов `refresh()` в `onFinish` сразу после ответа покажет сервер, пропущенный во время ответа (например, тот, где нужно войти заново). Выключенный сервер показывается как `idle`. Для одного сервера используйте `useMCP({ id: 'notion', server: '/api/mcp' })`.

Если ваш API авторизует запросы bearer-токенами, а не cookie, передайте `headers` (объект, ref или геттер), а при необходимости — свой `fetch`. `credentials` по умолчанию `'include'`.

Страницу возврата в серверном режиме писать не нужно: коннектор сам отдаёт её по адресу `${publicUrl}${basePath}/callback`. Эта страница не завершает вход сама. Она передаёт ответ провайдера окну, которое её открыло, а `useMCP` / `useMCPServers` отправляют его в `POST {server}/servers/:id/complete` с сессией пользователя. Всплывающее окно должно сохранить ссылку на открывшее его окно (opener); когда `publicUrl` на том же origin, что и фронтенд, дополнительно отправляется сообщение через `BroadcastChannel`.

| Опция | Описание |
|--------|-------------|
| `basePath` | Куда смонтирован `handler`, например `'/api/mcp'` |
| `publicUrl` | Обязательна. Абсолютный origin вашего приложения. Адрес возврата после входа — `${publicUrl}${basePath}/callback`; из заголовков запроса он не берётся никогда. |
| `allowedOrigins` | Origin фронтенда, которым разрешено обращаться к маршрутам (CORS с credentials, проверка CSRF). По умолчанию — origin `publicUrl` |
| `servers` | Каталог, который может включить любой пользователь: готовые описания или `{ id, url, name?, oauth? }`. У каждого можно задать `include` / `exclude` (см. [Как ограничить инструменты](#limiting-tools)) |
| `user` | Обязательна. Возвращает id вошедшего пользователя для запроса или `null` (тогда маршруты отвечают 401) |
| `store` | Где хранятся токены, регистрации и список каждого пользователя: любые `get`/`set`/`remove`, синхронные или асинхронные. `useStorage()` из Nitro и unstorage подходят как есть. |
| `secret` | Шифрует все сохраняемые значения (AES-GCM). Обязательна, когда `NODE_ENV` равен `production`; в разработке без неё значения хранятся открытым текстом и в лог пишется предупреждение. |
| `allowCustom` | Разрешает пользователям добавлять серверы по URL. По умолчанию `false`. До 20 серверов на пользователя, URL — до 2048 символов, имя — до 100 (иначе 400); на URL, который уже есть в списке пользователя, ответ — 409 с `id` этого сервера. См. [Замечания о безопасности](#security-notes). |
| `allowHosts` | Шаблоны хостов (`example.com`, `*.example.com`), разрешённые для добавленных пользователями серверов и для их входа |
| `timeout` | Сколько ждать подключения к одному серверу, в мс. По умолчанию `10000`; более медленный сервер пропускается и показывается с ошибкой. |
| `clientName` | Показывается на экране согласия провайдера. По умолчанию — хост `publicUrl` |
| `fetch` | Используется для всех исходящих запросов |

#### GitHub {#github}

GitHub через серверный режим должен работать, но с vue-llm пока не проверен. У MCP-сервера GitHub нет динамической регистрации клиентов, поэтому OAuth-приложение нужно зарегистрировать самому: на GitHub, **Settings → Developer settings → OAuth Apps → New OAuth App**, с адресом возврата `${publicUrl}${basePath}/callback` (для примера выше — `https://app.example.com/api/mcp/callback`). Затем передайте его данные:

```ts
servers: [
  mcpServers.notion,
  {
    ...mcpServers.github,
    oauth: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scopes: ['…'], // необязательно: права GitHub, которые нужны вашим инструментам
    },
  },
],
```

Та же опция `oauth` подходит для любого сервера, которому нужен заранее зарегистрированный клиент.

### Замечания о безопасности {#security-notes}

- **Добавленные пользователем серверы видят, что им отправляет модель, и могут ей отвечать.** Такой сервер получает вызовы своих инструментов, а описания и результаты его инструментов попадают к модели — значит, он может пытаться сделать prompt injection. Показывайте хост сервера до того, как пользователь войдёт (как в шаблоне выше), и не включайте `allowCustom` без необходимости.
- **В серверном режиме бэкенд обращается по адресам, которые выбрали пользователи** (`allowCustom`). Коннектор принимает только `https://`, всегда отказывает loopback-, частным, link-local-адресам и адресам облачных метаданных и проверяет каждый редирект. Кроме того:
  - В продакшене задайте `allowHosts`. Перечислите хосты разрешённых серверов *и* хосты, которые используются при входе в них (сервер авторизации), иначе вход в них будет отклонён.
  - Без `allowHosts` каждый хост проверяется через `node:dns` (Node, Bun, Deno) и отклоняется, если хотя бы один его адрес частный. Эта проверка не защищает от DNS rebinding — ещё одна причина задать `allowHosts`.
  - В edge-средах без `node:dns` (Cloudflare Workers, edge-функции) `allowCustom` требует `allowHosts`: без него добавление сервера завершится ошибкой с объяснением.
- **Метаданные входа должны совпадать точно.** `issuer` в метаданных сервера авторизации провайдера должен в точности совпадать с адресом сервера авторизации (RFC 8414); войти в сервер, у которого это не так, не получится.
- В серверном режиме маршруты сверяют заголовок `Origin` с `allowedOrigins` (изменения без него отклоняются) и требуют вошедшего пользователя (`user`). Токены провайдера никогда не попадают в ответы браузеру.
- **Вход привязан к пользователю, который его начал.** Страница возврата лишь передаёт ответ провайдера открывшему её окну; бэкенд сохраняет токены, только когда `POST /servers/:id/complete` приходит от того же `user` (и для того же сервера), который вызвал `authorize`. Если кто-то пришлёт другому человеку свою ссылку для входа, аккаунт этого человека не привяжется к пользователю отправителя.
