---
description: 'vue-llm の API リファレンス：コンポーザブル、プロバイダー、ミドルウェア、サーバーハンドラー、コンポーネント、TypeScript の型。'
---

# API リファレンス

## `vue-llm`

### コンポーザブル {#composables}

| エクスポート | 説明 |
|--------|-------------|
| [`useChat(options)`](/ja/guide/use-chat) | ストリーミング対応のマルチターンチャット |
| [`useCompletion(options)`](/ja/guide/use-completion) | ストリーミング対応のシングルターン補完 |
| [`useObject(options)`](/ja/guide/use-object) | 構造化された JSON 出力のストリーミング |
| [`usePrompt(template, variables)`](/ja/guide/prompt-templates#useprompt) | リアクティブなプロンプトのレンダリング |

### チャット UI（ヘッドレス） {#chat-ui-headless}

| エクスポート | 説明 |
|--------|-------------|
| [`usePromptInput(chat, options?)`](/ja/guide/chat-ui#usepromptinput-chat-options) | Enter で送信、IME 対応、自動で伸びるテキストエリア、ファイル選択・ペースト・ドロップによる添付 |
| [`useAutoScroll(options?)`](/ja/guide/chat-ui#useautoscroll-options) | ストリーミング中は最下部に固定し、ユーザーが上にスクロールすると固定を解除 |

### ミドルウェア {#middleware}

| エクスポート | 説明 |
|--------|-------------|
| [`wrapProvider(provider, middlewares)`](/ja/guide/middleware) | プロバイダーにミドルウェアを適用する |
| `loggingMiddleware(label?)` | コンソールへのログ出力 |
| `headerMiddleware(headers)` | 追加の HTTP ヘッダー |
| [`retryMiddleware(options?)`](/ja/guide/retries-rate-limiting#retries) | 指数バックオフによるリトライ |
| [`rateLimitMiddleware(options)`](/ja/guide/retries-rate-limiting#client-side-rate-limiting) | クライアントサイドのリクエストキュー |
| `isRetryableError(error)` | デフォルトのリトライポリシー |

### ユーティリティ {#utilities}

| エクスポート | 説明 |
|--------|-------------|
| [`createPrompt(template, options?)`](/ja/guide/prompt-templates) | 型付きプロンプトテンプレート |
| [`createChatPrompt(messages, options?)`](/ja/guide/prompt-templates#createchatprompt) | 複数メッセージのテンプレート |
| `renderTemplate(template, variables)` | 型なしの単発レンダリング |
| [`createWebStorage(options?)`](/ja/guide/persistence) | localStorage/sessionStorage アダプター |
| `createMemoryStorage()` | インメモリーアダプター |
| [`fileToDataURL(blob)`](/ja/guide/attachments#helpers) | Blob を data URL として読み込む |
| `convertFilesToParts(files)` | ファイル → `FilePart[]` |
| [`LLMAPIError`](/ja/guide/retries-rate-limiting#errors) | HTTP エラークラス |
| [`defineTool(tool)`](/ja/guide/tool-calling) | `execute` を任意で持てる型付きツール |
| [`parsePartialJSON(text)`](/ja/guide/generative-ui#streaming-arguments) | ストリーミング中の不完全な JSON をパースする |

### 型 {#types}

`UIMessage`, `UIMessagePart`, `TextPart`, `ReasoningPart`, `ToolCallPart`, `FilePart`, `SourcePart`, `ToolDefinition`, `ChatTool`, `ToolCallState`, `ToolExecutionContext`, `ToolComponentProps`, `DeepPartial`, `ChatStatus`, `FinishReason`, `Usage`, `LLMProvider`, `ChatRequest`, `ChatMessage`, `ContentPart`, `ChatStreamResult`, `ChatStreamChunk`, `ChatResponse`, `Middleware`, `ChatHandler`, `RetryOptions`, `RateLimitOptions`, `ChatStorage`, `WebStorageOptions`, `FileInput`, `SendMessageInput`, `PromptTemplate`, `ChatPromptTemplate`, `ChatPromptMessage`, `PromptOptions`, `PromptInput`, `PromptValue`, `PromptVariables`, `PromptVariableNames`、さらに各コンポーザブルの `Use*Options` / `Use*Return`。

## `vue-llm/providers`

[`createOpenAI`](/ja/guide/providers#openai), [`createAnthropic`](/ja/guide/providers#anthropic), [`createGoogle`](/ja/guide/providers#google-gemini), [`createOllama`](/ja/guide/providers#ollama), [`createSSEProvider`](/ja/guide/custom-backends), [`createWebLLM`](/ja/guide/in-browser), `isWebGPUSupported`.

## `vue-llm/server`

[`createLLMHandler`](/ja/guide/server#createllmhandler)（[サーバーツール](/ja/guide/server#server-tools) を含む）、[`createProxyProvider`](/ja/guide/server#createproxyprovider)、[`streamToSSE`](/ja/guide/server#streamtosse)。

## `vue-llm/devtools`

[`LLMDevtools`](/ja/guide/devtools)：Vue DevTools プラグイン（`@vue/devtools-api` が必要）。

## `vue-llm/style.css`

コンポーネント用のスタイル。

## `vue-llm/nuxt`

[Nuxt モジュール](/ja/guide/nuxt)。

## `vue-llm/components`

[`MessageParts`](/ja/guide/components#messageparts), [`StreamMarkdown`](/ja/guide/components#streammarkdown), [`renderMarkdown`](/ja/guide/components#security), `renderInline`, `escapeHTML`.
