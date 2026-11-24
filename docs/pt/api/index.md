---
description: 'Referência da API do vue-llm: composables, provedores, middleware, handler de servidor, componentes e tipos TypeScript.'
---

# Referência da API

## `vue-llm`

### Composables

| Export | Descrição |
|--------|-------------|
| [`useChat(options)`](/pt/guide/use-chat) | Chat multi-turn com streaming |
| [`useCompletion(options)`](/pt/guide/use-completion) | Completion de turno único com streaming |
| [`useObject(options)`](/pt/guide/use-object) | Saída JSON estruturada com streaming |
| [`usePrompt(template, variables)`](/pt/guide/prompt-templates#useprompt) | Renderização reativa de prompts |
| [`useMCP(options)`](/pt/guide/mcp#one-server-usemcp) | O usuário conecta um servidor MCP: login, estado, ferramentas reativas |
| [`useMCPServers(options?)`](/pt/guide/mcp#several-servers-usemcpservers) | Uma lista de servidores MCP que o usuário liga, em que faz login e que adiciona por URL |

### Chat UI (headless) {#chat-ui-headless}

| Export | Descrição |
|--------|-------------|
| [`usePromptInput(chat, options?)`](/pt/guide/chat-ui#usepromptinput-chat-options) | Enter para enviar, seguro para IME, textarea que cresce sozinha, anexos via seletor, colar e arrastar |
| [`useAutoScroll(options?)`](/pt/guide/chat-ui#useautoscroll-options) | Fica grudado no fim durante o streaming e solta quando o usuário rola para cima |

### Middleware

| Export | Descrição |
|--------|-------------|
| [`wrapProvider(provider, middlewares)`](/pt/guide/middleware) | Aplica middleware a um provedor |
| `loggingMiddleware(label?)` | Log no console |
| `headerMiddleware(headers)` | Headers HTTP extras |
| [`retryMiddleware(options?)`](/pt/guide/retries-rate-limiting#retries) | Retentativas com backoff exponencial |
| [`rateLimitMiddleware(options)`](/pt/guide/retries-rate-limiting#client-side-rate-limiting) | Fila de requisições no cliente |
| `isRetryableError(error)` | Política de retentativa padrão |

### Utilitários {#utilities}

| Export | Descrição |
|--------|-------------|
| [`createPrompt(template, options?)`](/pt/guide/prompt-templates) | Template de prompt tipado |
| [`createChatPrompt(messages, options?)`](/pt/guide/prompt-templates#createchatprompt) | Template com várias mensagens |
| `renderTemplate(template, variables)` | Renderização avulsa sem tipos |
| [`createWebStorage(options?)`](/pt/guide/persistence) | Adapter para localStorage/sessionStorage |
| `createMemoryStorage()` | Adapter em memória |
| [`fileToDataURL(blob)`](/pt/guide/attachments#helpers) | Lê um Blob como data URL |
| `convertFilesToParts(files)` | Arquivos → `FilePart[]` |
| [`LLMAPIError`](/pt/guide/retries-rate-limiting#errors) | Classe de erro HTTP |
| [`defineTool(tool)`](/pt/guide/tool-calling) | Ferramenta tipada com `execute` opcional |
| [`parsePartialJSON(text)`](/pt/guide/generative-ui#streaming-arguments) | Faz parse de JSON incompleto durante o streaming |
| [`toUIMessages(messages)`](/pt/guide/nuxt-ui) | mensagens no formato do Vercel AI SDK, por exemplo para os componentes de chat do Nuxt UI |

### Tipos {#types}

`UIMessage`, `UIMessagePart`, `TextPart`, `ReasoningPart`, `ToolCallPart`, `FilePart`, `SourcePart`, `ToolDefinition`, `ChatTool`, `ToolCallState`, `ToolExecutionContext`, `ToolComponentProps`, `DeepPartial`, `ChatStatus`, `FinishReason`, `Usage`, `LLMProvider`, `ChatRequest`, `ChatMessage`, `ContentPart`, `ChatStreamResult`, `ChatStreamChunk`, `ChatResponse`, `Middleware`, `ChatHandler`, `RetryOptions`, `RateLimitOptions`, `ChatStorage`, `WebStorageOptions`, `FileInput`, `SendMessageInput`, `PromptTemplate`, `ChatPromptTemplate`, `ChatPromptMessage`, `PromptOptions`, `PromptInput`, `PromptValue`, `PromptVariables`, `PromptVariableNames`, `MCPState`, `MCPServerItem`, `MCPServerEntry`, `MCPServerPreset`, `MCPServerModeOptions`, `AISDKUIMessage`, `AISDKUIPart`, além dos `Use*Options` / `Use*Return` de cada composable.

## `vue-llm/providers`

[`createOpenAI`](/pt/guide/providers#openai), [`createAnthropic`](/pt/guide/providers#anthropic), [`createGoogle`](/pt/guide/providers#google-gemini), [`createOllama`](/pt/guide/providers#ollama), [`createSSEProvider`](/pt/guide/custom-backends), [`createWebLLM`](/pt/guide/in-browser), `isWebGPUSupported`.

## `vue-llm/server`

[`createLLMHandler`](/pt/guide/server#createllmhandler) (com [ferramentas no servidor](/pt/guide/server#server-tools)), [`createProxyProvider`](/pt/guide/server#createproxyprovider), [`streamToSSE`](/pt/guide/server#streamtosse), [`createMCPConnector`](/pt/guide/mcp#server-mode): os usuários conectam os próprios servidores MCP pelo seu backend.

## `vue-llm/mcp`

[`mcpTools`](/pt/guide/mcp): ferramentas de um servidor MCP para `useChat` e `createLLMHandler` (use com `@modelcontextprotocol/sdk`).

[`handleMCPCallback`](/pt/guide/mcp#the-callback-page): chame-o na página de callback do login. [`mcpServers`](/pt/guide/mcp#several-servers-usemcpservers): presets para Notion, Linear, Hugging Face, DeepWiki e GitHub. `createMCPClient`: o cliente Streamable HTTP sem dependências por trás do `useMCP`, que pode ser usado com `mcpTools`. Erros: [`MCPUnsupportedServerError`](/pt/guide/mcp#which-servers-work-in-the-browser), `MCPHTTPError`, `MCPAuthError`, `MCPProtocolError`.

## `vue-llm/devtools`

[`LLMDevtools`](/pt/guide/devtools): plugin do Vue DevTools (requer `@vue/devtools-api`).

## `vue-llm/style.css`

Estilos dos componentes.

## `vue-llm/nuxt`

[Módulo Nuxt](/pt/guide/nuxt).

## `vue-llm/components`

[`MessageParts`](/pt/guide/components#messageparts), [`StreamMarkdown`](/pt/guide/components#streammarkdown), [`renderMarkdown`](/pt/guide/components#security), `renderInline`, `escapeHTML`.

## `vue-llm/components/vue2`

Os mesmos exports, gerados para o [Vue 2.7](/pt/guide/components#vue-2-7), além dos tipos `StreamMarkdownProps`, `MessagePartsProps`, `MessagePartsSlotProps`.
