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

### Типы {#types}

`UIMessage`, `UIMessagePart`, `TextPart`, `ReasoningPart`, `ToolCallPart`, `FilePart`, `SourcePart`, `ToolDefinition`, `ChatTool`, `ToolCallState`, `ToolExecutionContext`, `ToolComponentProps`, `DeepPartial`, `ChatStatus`, `FinishReason`, `Usage`, `LLMProvider`, `ChatRequest`, `ChatMessage`, `ContentPart`, `ChatStreamResult`, `ChatStreamChunk`, `ChatResponse`, `Middleware`, `ChatHandler`, `RetryOptions`, `RateLimitOptions`, `ChatStorage`, `WebStorageOptions`, `FileInput`, `SendMessageInput`, `PromptTemplate`, `ChatPromptTemplate`, `ChatPromptMessage`, `PromptOptions`, `PromptInput`, `PromptValue`, `PromptVariables`, `PromptVariableNames`, а также `Use*Options` / `Use*Return` каждого композабла.

## `vue-llm/providers` {#vue-llm-providers}

[`createOpenAI`](/ru/guide/providers#openai), [`createAnthropic`](/ru/guide/providers#anthropic), [`createGoogle`](/ru/guide/providers#google-gemini), [`createOllama`](/ru/guide/providers#ollama), [`createSSEProvider`](/ru/guide/custom-backends), [`createWebLLM`](/ru/guide/in-browser), `isWebGPUSupported`.

## `vue-llm/server` {#vue-llm-server}

[`createLLMHandler`](/ru/guide/server#createllmhandler) (с [серверными инструментами](/ru/guide/server#server-tools)), [`createProxyProvider`](/ru/guide/server#createproxyprovider), [`streamToSSE`](/ru/guide/server#streamtosse).

## `vue-llm/devtools` {#vue-llm-devtools}

[`LLMDevtools`](/ru/guide/devtools): плагин для Vue DevTools (требует `@vue/devtools-api`).

## `vue-llm/style.css` {#vue-llm-style-css}

Стили для компонентов.

## `vue-llm/nuxt` {#vue-llm-nuxt}

[Nuxt-модуль](/ru/guide/nuxt).

## `vue-llm/components` {#vue-llm-components}

[`MessageParts`](/ru/guide/components#messageparts), [`StreamMarkdown`](/ru/guide/components#streammarkdown), [`renderMarkdown`](/ru/guide/components#security), `renderInline`, `escapeHTML`.
