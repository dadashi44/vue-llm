---
description: 'API reference for vue-llm: composables, providers, middleware, server handler, components and TypeScript types.'
---

# API Reference

## `vue-llm`

### Composables

| Export | Description |
|--------|-------------|
| [`useChat(options)`](/guide/use-chat) | Streaming multi-turn chat |
| [`useCompletion(options)`](/guide/use-completion) | Streaming single-turn completion |
| [`useObject(options)`](/guide/use-object) | Streaming structured JSON output |
| [`usePrompt(template, variables)`](/guide/prompt-templates#useprompt) | Reactive prompt rendering |

### Chat UI (headless)

| Export | Description |
|--------|-------------|
| [`usePromptInput(chat, options?)`](/guide/chat-ui#usepromptinput-chat-options) | Enter to send, IME-safe, auto-growing textarea, attachments from picker, paste and drop |
| [`useAutoScroll(options?)`](/guide/chat-ui#useautoscroll-options) | Stick to the bottom while streaming, unpin when the user scrolls up |

### Middleware

| Export | Description |
|--------|-------------|
| [`wrapProvider(provider, middlewares)`](/guide/middleware) | Apply middleware to a provider |
| `loggingMiddleware(label?)` | Console logging |
| `headerMiddleware(headers)` | Extra HTTP headers |
| [`retryMiddleware(options?)`](/guide/retries-rate-limiting#retries) | Retries with exponential backoff |
| [`rateLimitMiddleware(options)`](/guide/retries-rate-limiting#client-side-rate-limiting) | Client-side request queue |
| `isRetryableError(error)` | Default retry policy |

### Utilities

| Export | Description |
|--------|-------------|
| [`createPrompt(template, options?)`](/guide/prompt-templates) | Typed prompt template |
| [`createChatPrompt(messages, options?)`](/guide/prompt-templates#createchatprompt) | Multi-message template |
| `renderTemplate(template, variables)` | Untyped one-off rendering |
| [`createWebStorage(options?)`](/guide/persistence) | localStorage/sessionStorage adapter |
| `createMemoryStorage()` | In-memory adapter |
| [`fileToDataURL(blob)`](/guide/attachments#helpers) | Read a Blob as a data URL |
| `convertFilesToParts(files)` | Files → `FilePart[]` |
| [`LLMAPIError`](/guide/retries-rate-limiting#errors) | HTTP error class |
| [`defineTool(tool)`](/guide/tool-calling) | Typed tool with optional `execute` |
| [`parsePartialJSON(text)`](/guide/generative-ui#streaming-arguments) | Parse incomplete JSON while it streams |

### Types

`UIMessage`, `UIMessagePart`, `TextPart`, `ReasoningPart`, `ToolCallPart`, `FilePart`, `SourcePart`, `ToolDefinition`, `ChatTool`, `ToolCallState`, `ToolExecutionContext`, `ToolComponentProps`, `DeepPartial`, `ChatStatus`, `FinishReason`, `Usage`, `LLMProvider`, `ChatRequest`, `ChatMessage`, `ContentPart`, `ChatStreamResult`, `ChatStreamChunk`, `ChatResponse`, `Middleware`, `ChatHandler`, `RetryOptions`, `RateLimitOptions`, `ChatStorage`, `WebStorageOptions`, `FileInput`, `SendMessageInput`, `PromptTemplate`, `ChatPromptTemplate`, `ChatPromptMessage`, `PromptOptions`, `PromptInput`, `PromptValue`, `PromptVariables`, `PromptVariableNames`, plus each composable's `Use*Options` / `Use*Return`.

## `vue-llm/providers`

[`createOpenAI`](/guide/providers#openai), [`createAnthropic`](/guide/providers#anthropic), [`createGoogle`](/guide/providers#google-gemini), [`createOllama`](/guide/providers#ollama), [`createSSEProvider`](/guide/custom-backends), [`createWebLLM`](/guide/in-browser), `isWebGPUSupported`.

## `vue-llm/server`

[`createLLMHandler`](/guide/server#createllmhandler) (with [server tools](/guide/server#server-tools)), [`createProxyProvider`](/guide/server#createproxyprovider), [`streamToSSE`](/guide/server#streamtosse).

## `vue-llm/devtools`

[`LLMDevtools`](/guide/devtools): Vue DevTools plugin (requires `@vue/devtools-api`).

## `vue-llm/style.css`

Styles for the components.

## `vue-llm/nuxt`

[Nuxt module](/guide/nuxt).

## `vue-llm/components`

[`MessageParts`](/guide/components#messageparts), [`StreamMarkdown`](/guide/components#streammarkdown), [`renderMarkdown`](/guide/components#security), `renderInline`, `escapeHTML`.
