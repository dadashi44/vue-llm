---
description: 'Referencia de la API de vue-llm: composables, proveedores, middleware, manejador de servidor, componentes y tipos de TypeScript.'
---

# Referencia de la API

## `vue-llm`

### Composables

| Export | Descripción |
|--------|-------------|
| [`useChat(options)`](/es/guide/use-chat) | Chat multiturno con streaming |
| [`useCompletion(options)`](/es/guide/use-completion) | Completado de un solo turno con streaming |
| [`useObject(options)`](/es/guide/use-object) | Salida JSON estructurada con streaming |
| [`usePrompt(template, variables)`](/es/guide/prompt-templates#useprompt) | Renderizado reactivo de prompts |

### Chat UI (headless) {#chat-ui-headless}

| Export | Descripción |
|--------|-------------|
| [`usePromptInput(chat, options?)`](/es/guide/chat-ui#usepromptinput-chat-options) | Enter para enviar, seguro con IME, textarea que crece sola, adjuntos desde el selector, pegar y soltar |
| [`useAutoScroll(options?)`](/es/guide/chat-ui#useautoscroll-options) | Se mantiene abajo durante el streaming y se suelta cuando el usuario sube |

### Middleware

| Export | Descripción |
|--------|-------------|
| [`wrapProvider(provider, middlewares)`](/es/guide/middleware) | Aplica middleware a un proveedor |
| `loggingMiddleware(label?)` | Logs en consola |
| `headerMiddleware(headers)` | Cabeceras HTTP adicionales |
| [`retryMiddleware(options?)`](/es/guide/retries-rate-limiting#retries) | Reintentos con backoff exponencial |
| [`rateLimitMiddleware(options)`](/es/guide/retries-rate-limiting#client-side-rate-limiting) | Cola de peticiones en el cliente |
| `isRetryableError(error)` | Política de reintentos por defecto |

### Utilidades {#utilities}

| Export | Descripción |
|--------|-------------|
| [`createPrompt(template, options?)`](/es/guide/prompt-templates) | Plantilla de prompt tipada |
| [`createChatPrompt(messages, options?)`](/es/guide/prompt-templates#createchatprompt) | Plantilla de varios mensajes |
| `renderTemplate(template, variables)` | Renderizado puntual sin tipos |
| [`createWebStorage(options?)`](/es/guide/persistence) | Adaptador para localStorage/sessionStorage |
| `createMemoryStorage()` | Adaptador en memoria |
| [`fileToDataURL(blob)`](/es/guide/attachments#helpers) | Lee un Blob como data URL |
| `convertFilesToParts(files)` | Archivos → `FilePart[]` |
| [`LLMAPIError`](/es/guide/retries-rate-limiting#errors) | Clase de error HTTP |
| [`defineTool(tool)`](/es/guide/tool-calling) | Herramienta tipada con `execute` opcional |
| [`parsePartialJSON(text)`](/es/guide/generative-ui#streaming-arguments) | Parsea JSON incompleto mientras llega por streaming |

### Tipos {#types}

`UIMessage`, `UIMessagePart`, `TextPart`, `ReasoningPart`, `ToolCallPart`, `FilePart`, `SourcePart`, `ToolDefinition`, `ChatTool`, `ToolCallState`, `ToolExecutionContext`, `ToolComponentProps`, `DeepPartial`, `ChatStatus`, `FinishReason`, `Usage`, `LLMProvider`, `ChatRequest`, `ChatMessage`, `ContentPart`, `ChatStreamResult`, `ChatStreamChunk`, `ChatResponse`, `Middleware`, `ChatHandler`, `RetryOptions`, `RateLimitOptions`, `ChatStorage`, `WebStorageOptions`, `FileInput`, `SendMessageInput`, `PromptTemplate`, `ChatPromptTemplate`, `ChatPromptMessage`, `PromptOptions`, `PromptInput`, `PromptValue`, `PromptVariables`, `PromptVariableNames`, además de los `Use*Options` / `Use*Return` de cada composable.

## `vue-llm/providers`

[`createOpenAI`](/es/guide/providers#openai), [`createAnthropic`](/es/guide/providers#anthropic), [`createGoogle`](/es/guide/providers#google-gemini), [`createOllama`](/es/guide/providers#ollama), [`createSSEProvider`](/es/guide/custom-backends), [`createWebLLM`](/es/guide/in-browser), `isWebGPUSupported`.

## `vue-llm/server`

[`createLLMHandler`](/es/guide/server#createllmhandler) (con [herramientas de servidor](/es/guide/server#server-tools)), [`createProxyProvider`](/es/guide/server#createproxyprovider), [`streamToSSE`](/es/guide/server#streamtosse).

## `vue-llm/devtools`

[`LLMDevtools`](/es/guide/devtools): plugin de Vue DevTools (requiere `@vue/devtools-api`).

## `vue-llm/style.css`

Estilos para los componentes.

## `vue-llm/nuxt`

[Módulo de Nuxt](/es/guide/nuxt).

## `vue-llm/components`

[`MessageParts`](/es/guide/components#messageparts), [`StreamMarkdown`](/es/guide/components#streammarkdown), [`renderMarkdown`](/es/guide/components#security), `renderInline`, `escapeHTML`.
