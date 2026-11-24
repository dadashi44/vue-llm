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
| [`useMCP(options)`](/guide/mcp#one-server-usemcp) | The user connects one MCP server: sign-in, state, reactive tools |
| [`useMCPServers(options?)`](/guide/mcp#several-servers-usemcpservers) | A list of MCP servers the user turns on, signs in to and adds by URL |

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
| [`toUIMessages(messages)`](/guide/nuxt-ui) | messages in the Vercel AI SDK shape, e.g. for Nuxt UI chat components |

### Types

`UIMessage`, `UIMessagePart`, `TextPart`, `ReasoningPart`, `ToolCallPart`, `FilePart`, `SourcePart`, `ToolDefinition`, `ChatTool`, `ToolCallState`, `ToolExecutionContext`, `ToolComponentProps`, `DeepPartial`, `ChatStatus`, `FinishReason`, `Usage`, `LLMProvider`, `ChatRequest`, `ChatMessage`, `ContentPart`, `ChatStreamResult`, `ChatStreamChunk`, `ChatResponse`, `Middleware`, `ChatHandler`, `RetryOptions`, `RateLimitOptions`, `ChatStorage`, `WebStorageOptions`, `FileInput`, `SendMessageInput`, `PromptTemplate`, `ChatPromptTemplate`, `ChatPromptMessage`, `PromptOptions`, `PromptInput`, `PromptValue`, `PromptVariables`, `PromptVariableNames`, `MCPState`, `MCPServerItem`, `MCPServerEntry`, `MCPServerPreset`, `MCPServerModeOptions`, `AISDKUIMessage`, `AISDKUIPart`, plus each composable's `Use*Options` / `Use*Return`.

## `vue-llm/providers`

[`createOpenAI`](/guide/providers#openai), [`createAnthropic`](/guide/providers#anthropic), [`createGoogle`](/guide/providers#google-gemini), [`createOllama`](/guide/providers#ollama), [`createSSEProvider`](/guide/custom-backends), [`createWebLLM`](/guide/in-browser), `isWebGPUSupported`.

## `vue-llm/server`

[`createLLMHandler`](/guide/server#createllmhandler) (with [server tools](/guide/server#server-tools)), [`createProxyProvider`](/guide/server#createproxyprovider), [`streamToSSE`](/guide/server#streamtosse), [`createMCPConnector`](/guide/mcp#server-mode): users connect their own MCP servers through your backend.

## `vue-llm/mcp`

[`mcpTools`](/guide/mcp): tools of an MCP server for `useChat` and `createLLMHandler` (use with `@modelcontextprotocol/sdk`).

[`handleMCPCallback`](/guide/mcp#the-callback-page): call it on the sign-in callback page. [`mcpServers`](/guide/mcp#several-servers-usemcpservers): presets for Notion, Linear, Hugging Face, DeepWiki and GitHub. `createMCPClient`: the dependency-free Streamable HTTP client behind `useMCP`, usable with `mcpTools`. Errors: [`MCPUnsupportedServerError`](/guide/mcp#which-servers-work-in-the-browser), `MCPHTTPError`, `MCPAuthError`, `MCPProtocolError`.

## `vue-llm/devtools`

[`LLMDevtools`](/guide/devtools): Vue DevTools plugin (requires `@vue/devtools-api`).

## `vue-llm/style.css`

Styles for the components.

## `vue-llm/nuxt`

[Nuxt module](/guide/nuxt).

## `vue-llm/components`

[`MessageParts`](/guide/components#messageparts), [`StreamMarkdown`](/guide/components#streammarkdown), [`renderMarkdown`](/guide/components#security), `renderInline`, `escapeHTML`.

## `vue-llm/components/vue2`

The same exports built for [Vue 2.7](/guide/components#vue-2-7), plus the types `StreamMarkdownProps`, `MessagePartsProps`, `MessagePartsSlotProps`.
