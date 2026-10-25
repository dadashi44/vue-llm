export { useChat } from './composables/use-chat'
export type { UseChatOptions, UseChatReturn, SendMessageInput } from './composables/use-chat'

export { useCompletion } from './composables/use-completion'
export type { UseCompletionOptions, UseCompletionReturn } from './composables/use-completion'

export { useObject } from './composables/use-object'
export type { UseObjectOptions, UseObjectReturn } from './composables/use-object'

export { wrapProvider, loggingMiddleware, retryMiddleware, headerMiddleware } from './middleware'
export type { Middleware } from './middleware'

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
