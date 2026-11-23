export { useChat } from './composables/use-chat.js'
export type { UseChatOptions, UseChatReturn, SendMessageInput } from './composables/use-chat.js'

export { useCompletion } from './composables/use-completion.js'
export type { UseCompletionOptions, UseCompletionReturn } from './composables/use-completion.js'

export { useObject } from './composables/use-object.js'
export type { UseObjectOptions, UseObjectReturn } from './composables/use-object.js'

export { usePrompt } from './composables/use-prompt.js'

export { usePromptInput } from './composables/use-prompt-input.js'
export type { UsePromptInputOptions, UsePromptInputReturn, PromptInputChat } from './composables/use-prompt-input.js'

export { useAutoScroll } from './composables/use-auto-scroll.js'
export type { UseAutoScrollOptions, UseAutoScrollReturn } from './composables/use-auto-scroll.js'
export { createPrompt, createChatPrompt, renderTemplate } from './core/prompt.js'
export type {
  PromptTemplate,
  ChatPromptTemplate,
  ChatPromptMessage,
  PromptOptions,
  PromptInput,
  PromptValue,
  PromptVariables,
  PromptVariableNames,
} from './core/prompt.js'

export {
  wrapProvider,
  loggingMiddleware,
  retryMiddleware,
  rateLimitMiddleware,
  headerMiddleware,
  isRetryableError,
} from './middleware.js'
export type { Middleware, ChatHandler, RetryOptions, RateLimitOptions } from './middleware.js'

export { LLMAPIError } from './core/errors.js'

export { defineTool } from './types.js'
export { parsePartialJSON } from './core/partial-json.js'

export { fileToDataURL, convertFilesToParts } from './utils/file.js'
export type { FileInput } from './utils/file.js'

export { createWebStorage, createMemoryStorage } from './core/storage.js'
export type { ChatStorage, WebStorageOptions } from './core/storage.js'

export type {
  UIMessage,
  UIMessagePart,
  TextPart,
  ReasoningPart,
  ToolCallPart,
  FilePart,
  SourcePart,
  ToolDefinition,
  ChatTool,
  ToolCallState,
  ToolExecutionContext,
  ToolComponentProps,
  DeepPartial,
  ChatStatus,
  FinishReason,
  Usage,
} from './types.js'

export type {
  LLMProvider,
  ChatRequest,
  ChatTrigger,
  ChatMessage,
  ContentPart,
  ChatStreamResult,
  ChatStreamChunk,
  ChatResponse,
} from './providers/types.js'
