---
description: 'vue-llm API 参考：组合式函数、提供方、中间件、服务端处理器、组件与 TypeScript 类型。'
---

# API 参考

## `vue-llm`

### 组合式函数 {#composables}

| 导出 | 说明 |
|--------|-------------|
| [`useChat(options)`](/zh/guide/use-chat) | 流式多轮聊天 |
| [`useCompletion(options)`](/zh/guide/use-completion) | 流式单轮补全 |
| [`useObject(options)`](/zh/guide/use-object) | 流式结构化 JSON 输出 |
| [`usePrompt(template, variables)`](/zh/guide/prompt-templates#useprompt) | 响应式提示词渲染 |

### 聊天界面（无头） {#chat-ui-headless}

| 导出 | 说明 |
|--------|-------------|
| [`usePromptInput(chat, options?)`](/zh/guide/chat-ui#usepromptinput-chat-options) | 回车发送、兼容输入法、自动增高的 textarea，支持从文件选择器、粘贴和拖放添加附件 |
| [`useAutoScroll(options?)`](/zh/guide/chat-ui#useautoscroll-options) | 流式输出时保持在底部，用户向上滚动时取消固定 |

### 中间件 {#middleware}

| 导出 | 说明 |
|--------|-------------|
| [`wrapProvider(provider, middlewares)`](/zh/guide/middleware) | 为提供方应用中间件 |
| `loggingMiddleware(label?)` | 控制台日志 |
| `headerMiddleware(headers)` | 额外的 HTTP 请求头 |
| [`retryMiddleware(options?)`](/zh/guide/retries-rate-limiting#retries) | 指数退避重试 |
| [`rateLimitMiddleware(options)`](/zh/guide/retries-rate-limiting#client-side-rate-limiting) | 客户端请求队列 |
| `isRetryableError(error)` | 默认重试策略 |

### 工具函数 {#utilities}

| 导出 | 说明 |
|--------|-------------|
| [`createPrompt(template, options?)`](/zh/guide/prompt-templates) | 带类型的提示词模板 |
| [`createChatPrompt(messages, options?)`](/zh/guide/prompt-templates#createchatprompt) | 多消息模板 |
| `renderTemplate(template, variables)` | 无类型的一次性渲染 |
| [`createWebStorage(options?)`](/zh/guide/persistence) | localStorage/sessionStorage 适配器 |
| `createMemoryStorage()` | 内存适配器 |
| [`fileToDataURL(blob)`](/zh/guide/attachments#helpers) | 将 Blob 读取为 data URL |
| `convertFilesToParts(files)` | 文件 → `FilePart[]` |
| [`LLMAPIError`](/zh/guide/retries-rate-limiting#errors) | HTTP 错误类 |
| [`defineTool(tool)`](/zh/guide/tool-calling) | 带类型的工具，`execute` 可选 |
| [`parsePartialJSON(text)`](/zh/guide/generative-ui#streaming-arguments) | 在流式传输过程中解析不完整的 JSON |

### 类型 {#types}

`UIMessage`、`UIMessagePart`、`TextPart`、`ReasoningPart`、`ToolCallPart`、`FilePart`、`SourcePart`、`ToolDefinition`、`ChatTool`、`ToolCallState`、`ToolExecutionContext`、`ToolComponentProps`、`DeepPartial`、`ChatStatus`、`FinishReason`、`Usage`、`LLMProvider`、`ChatRequest`、`ChatMessage`、`ContentPart`、`ChatStreamResult`、`ChatStreamChunk`、`ChatResponse`、`Middleware`、`ChatHandler`、`RetryOptions`、`RateLimitOptions`、`ChatStorage`、`WebStorageOptions`、`FileInput`、`SendMessageInput`、`PromptTemplate`、`ChatPromptTemplate`、`ChatPromptMessage`、`PromptOptions`、`PromptInput`、`PromptValue`、`PromptVariables`、`PromptVariableNames`，以及每个组合式函数的 `Use*Options` / `Use*Return`。

## `vue-llm/providers`

[`createOpenAI`](/zh/guide/providers#openai)、[`createAnthropic`](/zh/guide/providers#anthropic)、[`createGoogle`](/zh/guide/providers#google-gemini)、[`createOllama`](/zh/guide/providers#ollama)、[`createSSEProvider`](/zh/guide/custom-backends)、[`createWebLLM`](/zh/guide/in-browser)、`isWebGPUSupported`。

## `vue-llm/server`

[`createLLMHandler`](/zh/guide/server#createllmhandler)（含 [服务端工具](/zh/guide/server#server-tools)）、[`createProxyProvider`](/zh/guide/server#createproxyprovider)、[`streamToSSE`](/zh/guide/server#streamtosse)。

## `vue-llm/devtools`

[`LLMDevtools`](/zh/guide/devtools)：Vue DevTools 插件（需要 `@vue/devtools-api`）。

## `vue-llm/style.css`

组件样式。

## `vue-llm/nuxt`

[Nuxt 模块](/zh/guide/nuxt)。

## `vue-llm/components`

[`MessageParts`](/zh/guide/components#messageparts)、[`StreamMarkdown`](/zh/guide/components#streammarkdown)、[`renderMarkdown`](/zh/guide/components#security)、`renderInline`、`escapeHTML`。
