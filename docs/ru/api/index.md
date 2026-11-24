---
description: 'Справочник API vue-llm: композаблы, провайдеры, middleware, серверный обработчик, компоненты и типы TypeScript.'
---

# Справочник API

## `vue-llm` {#vue-llm}

### Композаблы {#composables}

| Экспорт | Описание |
|--------|-------------|
| [`useChat(options)`](/ru/guide/use-chat) | Стриминговый многоходовый чат |
| [`useCompletion(options)`](/ru/guide/use-completion) | Стриминговое одноразовое дополнение текста |
| [`useObject(options)`](/ru/guide/use-object) | Стриминг структурированного JSON |
| [`usePrompt(template, variables)`](/ru/guide/prompt-templates#useprompt) | Реактивный рендеринг промпта |
| [`useMCP(options)`](/ru/guide/mcp#one-server-usemcp) | Пользователь подключает один MCP-сервер: вход, состояние, реактивные инструменты |
| [`useMCPServers(options?)`](/ru/guide/mcp#several-servers-usemcpservers) | Список MCP-серверов, которые пользователь включает, в которые входит и которые добавляет по URL |

### Chat UI (headless) {#chat-ui-headless}

| Экспорт | Описание |
|--------|-------------|
| [`usePromptInput(chat, options?)`](/ru/guide/chat-ui#usepromptinput-chat-options) | Отправка по Enter с учётом IME, авторастущий textarea, вложения из диалога выбора файлов, вставки и перетаскивания |
| [`useAutoScroll(options?)`](/ru/guide/chat-ui#useautoscroll-options) | Держит список внизу во время стриминга и отпускает, когда пользователь прокручивает вверх |

### Middleware {#middleware}

| Экспорт | Описание |
|--------|-------------|
| [`wrapProvider(provider, middlewares)`](/ru/guide/middleware) | Применяет middleware к провайдеру |
| `loggingMiddleware(label?)` | Логирование в консоль |
| `headerMiddleware(headers)` | Дополнительные HTTP-заголовки |
| [`retryMiddleware(options?)`](/ru/guide/retries-rate-limiting#retries) | Повторы с экспоненциальной задержкой |
| [`rateLimitMiddleware(options)`](/ru/guide/retries-rate-limiting#client-side-rate-limiting) | Очередь запросов на клиенте |
| `isRetryableError(error)` | Политика повторов по умолчанию |

### Утилиты {#utilities}

| Экспорт | Описание |
|--------|-------------|
| [`createPrompt(template, options?)`](/ru/guide/prompt-templates) | Типизированный шаблон промпта |
| [`createChatPrompt(messages, options?)`](/ru/guide/prompt-templates#createchatprompt) | Шаблон из нескольких сообщений |
| `renderTemplate(template, variables)` | Разовый рендеринг без типизации |
| [`createWebStorage(options?)`](/ru/guide/persistence) | Адаптер для localStorage/sessionStorage |
| `createMemoryStorage()` | Адаптер в памяти |
| [`fileToDataURL(blob)`](/ru/guide/attachments#helpers) | Читает Blob как data URL |
| `convertFilesToParts(files)` | Файлы → `FilePart[]` |
| [`LLMAPIError`](/ru/guide/retries-rate-limiting#errors) | Класс HTTP-ошибки |
| [`defineTool(tool)`](/ru/guide/tool-calling) | Типизированный инструмент с необязательным `execute` |
| [`parsePartialJSON(text)`](/ru/guide/generative-ui#streaming-arguments) | Разбирает неполный JSON по ходу стриминга |
| [`toUIMessages(messages)`](/ru/guide/nuxt-ui) | сообщения в формате Vercel AI SDK, например для чат-компонентов Nuxt UI |

### Типы {#types}

`UIMessage`, `UIMessagePart`, `TextPart`, `ReasoningPart`, `ToolCallPart`, `FilePart`, `SourcePart`, `ToolDefinition`, `ChatTool`, `ToolCallState`, `ToolExecutionContext`, `ToolComponentProps`, `DeepPartial`, `ChatStatus`, `FinishReason`, `Usage`, `LLMProvider`, `ChatRequest`, `ChatMessage`, `ContentPart`, `ChatStreamResult`, `ChatStreamChunk`, `ChatResponse`, `Middleware`, `ChatHandler`, `RetryOptions`, `RateLimitOptions`, `ChatStorage`, `WebStorageOptions`, `FileInput`, `SendMessageInput`, `PromptTemplate`, `ChatPromptTemplate`, `ChatPromptMessage`, `PromptOptions`, `PromptInput`, `PromptValue`, `PromptVariables`, `PromptVariableNames`, `MCPState`, `MCPServerItem`, `MCPServerEntry`, `MCPServerPreset`, `MCPServerModeOptions`, `AISDKUIMessage`, `AISDKUIPart`, а также `Use*Options` / `Use*Return` каждого композабла.

## `vue-llm/providers` {#vue-llm-providers}

[`createOpenAI`](/ru/guide/providers#openai), [`createAnthropic`](/ru/guide/providers#anthropic), [`createGoogle`](/ru/guide/providers#google-gemini), [`createOllama`](/ru/guide/providers#ollama), [`createSSEProvider`](/ru/guide/custom-backends), [`createWebLLM`](/ru/guide/in-browser), `isWebGPUSupported`.

## `vue-llm/server` {#vue-llm-server}

[`createLLMHandler`](/ru/guide/server#createllmhandler) (с [серверными инструментами](/ru/guide/server#server-tools)), [`createProxyProvider`](/ru/guide/server#createproxyprovider), [`streamToSSE`](/ru/guide/server#streamtosse), [`createMCPConnector`](/ru/guide/mcp#server-mode): пользователи подключают свои MCP-серверы через ваш бэкенд.

## `vue-llm/mcp` {#vue-llm-mcp}

[`mcpTools`](/ru/guide/mcp): инструменты MCP-сервера для `useChat` и `createLLMHandler` (вместе с `@modelcontextprotocol/sdk`).

[`handleMCPCallback`](/ru/guide/mcp#the-callback-page): вызывается на странице возврата после входа. [`mcpServers`](/ru/guide/mcp#several-servers-usemcpservers): готовые описания для Notion, Linear, Hugging Face, DeepWiki и GitHub. `createMCPClient`: MCP-клиент на Streamable HTTP без зависимостей, на котором построен `useMCP`; работает с `mcpTools`. Ошибки: [`MCPUnsupportedServerError`](/ru/guide/mcp#which-servers-work-in-the-browser), `MCPHTTPError`, `MCPAuthError`, `MCPProtocolError`.

## `vue-llm/devtools` {#vue-llm-devtools}

[`LLMDevtools`](/ru/guide/devtools): плагин для Vue DevTools (требует `@vue/devtools-api`).

## `vue-llm/style.css` {#vue-llm-style-css}

Стили для компонентов.

## `vue-llm/nuxt` {#vue-llm-nuxt}

[Nuxt-модуль](/ru/guide/nuxt).

## `vue-llm/components` {#vue-llm-components}

[`MessageParts`](/ru/guide/components#messageparts), [`StreamMarkdown`](/ru/guide/components#streammarkdown), [`renderMarkdown`](/ru/guide/components#security), `renderInline`, `escapeHTML`.

## `vue-llm/components/vue2` {#vue-llm-components-vue2}

Те же экспорты, собранные для [Vue 2.7](/ru/guide/components#vue-2-7), плюс типы `StreamMarkdownProps`, `MessagePartsProps`, `MessagePartsSlotProps`.
