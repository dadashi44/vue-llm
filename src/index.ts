export { useChat } from './composables/use-chat'
export type { UseChatOptions, UseChatReturn, SendMessageInput } from './composables/use-chat'

export { useCompletion } from './composables/use-completion'
export type { UseCompletionOptions, UseCompletionReturn } from './composables/use-completion'

export { useObject } from './composables/use-object'
export type { UseObjectOptions, UseObjectReturn } from './composables/use-object'

export { usePrompt } from './composables/use-prompt'
export { createPrompt, createChatPrompt, renderTemplate } from './core/prompt'
export type {
  PromptTemplate,
  ChatPromptTemplate,
  ChatPromptMessage,
  PromptOptions,
  PromptInput,
  PromptValue,
  PromptVariables,
  PromptVariableNames,
} from './core/prompt'

export {
  wrapProvider,
  loggingMiddleware,
  retryMiddleware,
  rateLimitMiddleware,
  headerMiddleware,
  isRetryableError,
} from './middleware'
export type { Middleware, ChatHandler, RetryOptions, RateLimitOptions } from './middleware'

export { LLMAPIError } from './core/errors'

export { fileToDataURL, convertFilesToParts } from './utils/file'
export type { FileInput } from './utils/file'

export { createWebStorage, createMemoryStorage } from './core/storage'
export type { ChatStorage, WebStorageOptions } from './core/storage'

export type {
  UIMessage,
  UIMessagePart,
  TextPart,
  ReasoningPart,
  ToolCallPart,
  FilePart,
  SourcePart,
  ToolDefinition,
  ChatStatus,
  FinishReason,
  Usage,
} from './types'

export type {
  LLMProvider,
  ChatRequest,
  ChatMessage,
  ContentPart,
  ChatStreamResult,
  ChatStreamChunk,
  ChatResponse,
} from './providers/types'
